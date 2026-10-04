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
}

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
