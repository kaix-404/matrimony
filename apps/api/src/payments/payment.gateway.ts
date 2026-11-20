/**
 * The payment gateway seam.
 *
 * Razorpay is the only implementation (spec section 29), but it is behind an
 * abstract class rather than used directly, for two reasons. Tests must be able
 * to exercise order creation and webhook handling without network access or
 * credentials, and section 46 keeps the vendor out of the rest of the code so a
 * migration to another provider touches this file alone.
 *
 * Nothing here trusts the gateway. It is treated as a source of *assertions*
 * about money, each of which the service re-checks against its own snapshot
 * before anything is granted. Section 40 requires the amount to be verified
 * against server-side order data, and this class deliberately returns the
 * gateway's number as a plain integer precisely so the service has something to
 * compare rather than a trusted verdict.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';
import { toDecimal } from '@matrimony/shared';

/** An order as the gateway created it. */
export interface GatewayOrder {
  gatewayOrderId: string;
  /** In the currency's smallest unit (paise). Never rupees, never a float. */
  amountMinor: number;
  currency: string;
}

export interface CreateGatewayOrderInput {
  amountMinor: number;
  currency: string;
  /** Gateway-visible reference; our Payment id, so support can reconcile. */
  receipt: string;
  notes: Record<string, string>;
}

/**
 * One payment attempt on an order, as the gateway reports it.
 *
 * This is what reconciliation reads when a webhook never arrived: the gateway
 * settles the order either way, so its own list of attempts is the only record
 * of money that was taken while this API was asleep.
 */
export interface GatewayPayment {
  gatewayPaymentId: string;
  /** The gateway's status: `created`, `authorized`, `captured`, `failed`, `refunded`. */
  status: string;
  /** In the currency's smallest unit, exactly as `GatewayOrder.amountMinor`. */
  amountMinor: number;
  currency: string;
  method?: string;
  /** The provider's own object, stored as the audit payload of a reconciliation. */
  raw: Record<string, unknown>;
}

/**
 * Reduce one payment object from the gateway to `GatewayPayment`, or null when
 * it lacks the fields a settlement decision needs.
 *
 * Pure and exported so it can be tested without the vendor SDK: an amount that
 * silently became `NaN` here would fail the snapshot comparison and mark a real
 * payment FAILED, which is worse than skipping the row.
 */
export function toGatewayPayment(item: unknown): GatewayPayment | null {
  if (typeof item !== 'object' || item === null) return null;
  const record = item as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id : '';
  const status = typeof record.status === 'string' ? record.status : '';
  const currency = typeof record.currency === 'string' ? record.currency : '';
  const amount =
    typeof record.amount === 'number' ? record.amount : Number(record.amount as string | undefined);

  if (id === '' || status === '' || currency === '' || !Number.isSafeInteger(amount)) return null;

  return {
    gatewayPaymentId: id,
    status,
    amountMinor: amount,
    currency,
    method: typeof record.method === 'string' ? record.method : undefined,
    raw: record,
  };
}

/**
 * Razorpay-specific event names. Only the two that grant or deny an unlock are
 * modelled; every other event type is accepted and logged without effect,
 * because a gateway adding an event must never become an outage.
 */
export const GATEWAY_EVENTS = {
  captured: 'payment.captured',
  orderPaid: 'order.paid',
  failed: 'payment.failed',
} as const;

export abstract class PaymentGateway {
  /**
   * Whether an order can be created: the key pair is present.
   *
   * Reported separately from `webhookConfigured` because the two fail
   * differently and only one of them is visible to a member. Without the key
   * pair nothing can be charged, and checkout says so. Without the webhook
   * secret a charge can succeed and never be confirmed — money taken, nothing
   * granted — which a single "is payments on?" boolean would hide.
   */
  abstract readonly configured: boolean;

  /** Whether a captured payment can be proven genuine before an unlock is granted. */
  abstract readonly webhookConfigured: boolean;

  /**
   * HMAC-SHA256 of the *raw* request body, keyed with the webhook secret, in
   * `<body>|<secret>` form. Implemented per provider.
   *
   * Takes the raw body rather than a re-serialised object on purpose: JSON key
   * order and whitespace are part of what was signed, so anything parsed and
   * re-encoded here would fail to verify for reasons that have nothing to do
   * with tampering.
   */
  abstract verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean;

  abstract createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrder>;

  /**
   * Every payment attempt the gateway holds for an order.
   *
   * The webhook is the normal path; this is the recovery path for a delivery
   * that never arrived (a sleeping instance, a gateway retry that expired). An
   * order is the unit, because an order that was paid has at least one captured
   * attempt under it, and a member who retries a failed attempt keeps the same
   * order id.
   */
  abstract fetchOrderPayments(gatewayOrderId: string): Promise<GatewayPayment[]>;

  /**
   * The publishable key a client needs to open checkout.
   *
   * Not a secret: it names the merchant and cannot authorise a charge, which is
   * why it is the half of the credential pair that may travel to a browser or a
   * phone. Exposed through the gateway rather than read from config by the
   * service so that a provider swap changes one file.
   */
  abstract publishableKeyId(): string;
}

/**
 * Ceiling on one order-payments read during reconciliation.
 *
 * Ten seconds, because a sweep reads at most twenty-five orders: the worst case
 * is a bit over four minutes, comfortably inside the sweep interval, whereas a
 * read with no ceiling at all holds the sweep and its socket for as long as the
 * provider leaves the connection open.
 */
const ORDER_PAYMENTS_TIMEOUT_MS = 10_000;

/** The vendor's REST root, matching the SDK's own base URL. */
const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

/**
 * Convert a rupee string to paise.
 *
 * The gateway speaks the currency's smallest unit; the API and the shared
 * contracts speak rupees. Routing every conversion through one function is what
 * stops the two being confused: passing "116.82" where 11682 is expected is
 * otherwise a silent 100x undercharge that no test of the total would catch.
 *
 * `toFixed(0)` after multiplying by 100 is exact because every amount reaching
 * here has already been rounded to two decimals by `quotePayment`.
 */
export function rupeesToMinor(rupees: Parameters<typeof toDecimal>[0]): number {
  const minor = toDecimal(rupees).mul(100);
  if (!minor.isInteger()) {
    throw new RangeError(`Amount ${rupees} has sub-paise precision and cannot be charged`);
  }
  const value = minor.toNumber();
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Amount ${rupees} overflows the gateway's integer amount`);
  }
  return value;
}

@Injectable()
export class RazorpayPaymentGateway extends PaymentGateway {
  private readonly logger = new Logger(RazorpayPaymentGateway.name);
  private readonly client: Razorpay | null;
  readonly configured: boolean;
  readonly webhookConfigured: boolean;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {
    super();
    // Nullish and blank are both "unconfigured": the SDK throws from its own
    // constructor on a missing key_id, which would take down an API that has no
    // business needing a payment provider to serve registration and discovery.
    const configured =
      typeof this.keyId === 'string' &&
      this.keyId.trim() !== '' &&
      typeof this.keySecret === 'string' &&
      this.keySecret.trim() !== '';
    this.configured = configured;
    this.webhookConfigured = typeof this.webhookSecret === 'string' && this.webhookSecret !== '';
    if (!configured) {
      // Loud, but not fatal: the API has to boot without payment credentials so
      // registration, discovery and photo flows can be developed. Any attempt
      // to actually charge fails closed in createOrder below.
      this.logger.warn(
        'RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are empty — order creation will reject.',
      );
    }
    this.client = configured
      ? new Razorpay({ key_id: this.keyId, key_secret: this.keySecret })
      : null;
  }

  publishableKeyId(): string {
    return this.keyId;
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (typeof this.webhookSecret !== 'string' || this.webhookSecret === '') {
      this.logger.error('RAZORPAY_WEBHOOK_SECRET is empty — cannot verify webhooks, rejecting.');
      return false;
    }
    if (typeof signature !== 'string' || signature.length === 0) return false;

    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${rawBody}|${this.webhookSecret}`)
      .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    // timingSafeEqual throws on a length mismatch, so the lengths are compared
    // first — and that early return is safe: a wrong-length signature cannot be
    // the right one.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async fetchOrderPayments(gatewayOrderId: string): Promise<GatewayPayment[]> {
    if (!this.client) {
      throw new Error("Razorpay is not configured; cannot fetch an order's payments");
    }

    // Read over `fetch` rather than through the SDK's `orders.fetchPayments`.
    // That call takes neither a signal nor a timeout (2.9.8), so a provider that
    // accepts the connection and then never answers would hold the sweep — and
    // its socket — for the life of the process. The credentials are the same
    // pair the SDK was constructed with, and `Authorization: Basic` is the same
    // mechanism it sends, so this is the SDK's request with a ceiling on it.
    const url = `${RAZORPAY_API_BASE}/orders/${encodeURIComponent(gatewayOrderId)}/payments`;
    const authorization = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;

    // The deadline is absolute from the signal's creation, and it covers the
    // body as well as the response headers: a provider that answers `200` and
    // then stalls mid-body rejects on `response.text()`, not on `fetch`. Both
    // rejections are the same timeout and must read as the same line, so the
    // whole exchange sits inside one guard.
    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { authorization, accept: 'application/json' },
        signal: AbortSignal.timeout(ORDER_PAYMENTS_TIMEOUT_MS),
      });
      text = await response.text();
    } catch (error) {
      const name = (error as { name?: string })?.name ?? '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new Error(
          `Razorpay order payments read timed out after ${ORDER_PAYMENTS_TIMEOUT_MS / 1000} s (order ${gatewayOrderId})`,
        );
      }
      throw error;
    }

    if (!response.ok) {
      // The body says whether it was the key or the order; it stays in the error
      // for the sweep's log line and is never forwarded to a member.
      throw new Error(
        `Razorpay order payments read failed (HTTP ${response.status}): ${text.slice(0, 400)}`,
      );
    }

    let payload: { items?: unknown };
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      throw new Error('Razorpay order payments read returned a non-JSON body');
    }

    // Reduced by `toGatewayPayment`: an item whose amount is not a whole number
    // of paise must be skipped, not compared, or a real capture is marked FAILED.
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items
      .map(toGatewayPayment)
      .filter((payment): payment is GatewayPayment => payment !== null);
  }

  async createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrder> {
    if (!this.client) {
      throw new Error('Razorpay is not configured; cannot create a payment order');
    }

    const order = await this.client.orders.create({
      amount: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
      // Section 15's window is decided when payment succeeds, not here, so the
      // gateway is not told an expiry it might enforce differently.
    });

    return {
      gatewayOrderId: String(order.id),
      amountMinor: Number(order.amount),
      currency: String(order.currency),
    };
  }
}
