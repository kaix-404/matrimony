/**
 * Payments: order creation, webhook processing, and the only path to an unlock.
 *
 * Spec sections 14, 15, 18, 27 and 40. The rules that shape this file:
 *
 *   * Section 14 — the app must never be trusted to declare a payment
 *     successful. There is no endpoint that grants an unlock. `handleWebhook`
 *     is the sole writer of `ContactUnlock`, and it does so only after
 *     verifying the gateway's signature and matching its amount against a
 *     snapshot the server took before the charge.
 *   * Section 36 — once a `Payment` row exists its amount columns are
 *     authoritative. The gateway's number is compared, never substituted, so a
 *     price change between order and payment cannot change what is owed.
 *   * Section 40 — webhooks are idempotent. Two independent mechanisms enforce
 *     it, because either alone leaves a hole: a unique event key stops a
 *     replayed delivery being processed twice, and `ContactUnlock.paymentId`
 *     stops a *different* event that resolves to the same payment from creating
 *     a second unlock.
 *   * Section 15 — the disclosure window is computed from server time, with
 *     both endpoints derived from one instant.
 *
 * Deliberately absent: refunds (section 27 is display-only), partial refunds,
 * and the admin manual-unlock path, which creates an `AdminGrantAudit` rather
 * than a Payment.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '../prisma/prisma-client';
import { ClockService } from '../common/clock/clock.service';
import { VisibilityPreferenceService } from '../discovery/visibility-preference.service';
import {
  ACCOUNT_SETUP_FEE,
  CURRENCY,
  GST_PERCENT,
  UNLOCK_WINDOW_HOURS,
  computeUnlockWindow,
  isUnlockActive,
  money,
  quotePayment,
  remainingMs,
  toDecimal,
  type PaymentOrderResponse,
  type PaymentStatusResponse,
  type PaymentWebhookAck,
  type PricingQuote,
  type UnlockPrice,
} from '@matrimony/shared';
import { GATEWAY_EVENTS, PaymentGateway, rupeesToMinor } from './payment.gateway';

type Tx = Prisma.TransactionClient;

/**
 * Failure codes recorded on the Payment. Stable strings: section 18
 * reconciliation is done by reading these, so they are part of the contract
 * rather than log text.
 */
const FAILURE = {
  amountMismatch: 'AMOUNT_MISMATCH',
  targetUnavailable: 'TARGET_UNAVAILABLE',
  gatewayError: 'GATEWAY_ERROR',
} as const;

/** What an ineligible caller is told, per user status. */
const BLOCKED_PURCHASERS: Record<string, string> = {
  PENDING_CATEGORY: 'Complete your profile before making a payment.',
  PENDING_VERIFICATION: 'Your identity verification has not completed yet.',
  AWAITING_SETUP_FEE: 'Pay the one-time account setup fee first.',
  SUSPENDED: 'This account is suspended.',
  DELETED: 'This account is deleted.',
};

/** The columns needed to price or replay an order. */
type OrderRow = Prisma.PaymentGetPayload<Record<string, never>>;

/** A webhook reduced to the fields this service acts on. */
interface ParsedWebhook {
  eventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  orderId?: string;
  amountMinor?: number;
  currency?: string;
  method?: string;
  gatewayPaymentId?: string;
  failureCode?: string;
  failureReason?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
    private readonly gateway: PaymentGateway,
    private readonly preferences: VisibilityPreferenceService,
  ) {}

  // -------------------------------------------------------------------------
  // Order creation
  // -------------------------------------------------------------------------

  /**
   * Price and open a gateway order for one profile's contact.
   *
   * The amount is derived here and never read from the request. Eligibility is
   * checked before anything else, so an ineligible caller cannot learn a price.
   */
  async createUnlockOrder(
    userId: string,
    profileId: string,
    idempotencyKey?: string,
  ): Promise<PaymentOrderResponse> {
    const buyer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!buyer) throw new NotFoundException('User not found');
    this.assertCanPurchase(buyer.status);

    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        firstName: true,
        status: true,
        visibility: true,
        deletedAt: true,
        user: { select: { id: true, networthCategory: true } },
      },
    });

    // One message for "absent", "not visible", "paused" and "yourself". Any
    // distinct message here confirms that a profile id exists to someone
    // outside the visibility scope it was checked against.
    if (
      !profile ||
      profile.user.id === userId ||
      profile.status !== 'APPROVED' ||
      profile.visibility !== 'ACTIVE' ||
      profile.deletedAt !== null
    ) {
      throw new NotFoundException('Profile not found');
    }

    // Section 12: buying is a read of the target's card, so it is gated by
    // exactly the same two-way scope the feed uses. An unlock for a profile you
    // cannot see would be a paid no-op and an existence oracle.
    if (!(await this.preferences.isDiscoverableBy(userId, profile.user.id))) {
      throw new NotFoundException('Profile not found');
    }

    const existing = await this.findByIdempotencyKey(idempotencyKey);
    if (existing) return this.replayOrder(existing);

    const quote = await this.quoteForCategory(profile.user.networthCategory);

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        purpose: 'UNLOCK',
        category: profile.user.networthCategory,
        targetProfileId: profile.id,
        baseAmount: quote.baseAmount,
        gstRate: quote.gstRate,
        gstAmount: quote.gstAmount,
        totalAmount: quote.totalAmount,
        currency: quote.currency,
        pricingConfigId: quote.pricingConfigId,
        status: 'CREATED',
        idempotencyKey: idempotencyKey ?? null,
      },
      select: { id: true, createdAt: true },
    });

    const gatewayOrder = await this.attachGatewayOrder(payment.id, quote.totalAmount, {
      purpose: 'UNLOCK',
      profile_id: profile.id,
    });

    return {
      payment_id: payment.id,
      purpose: 'UNLOCK',
      gateway: 'RAZORPAY',
      gateway_order_id: gatewayOrder.gatewayOrderId,
      amount: priceOf(quote),
      profile: { profile_id: profile.id, first_name: profile.firstName },
      unlock_window_hours: UNLOCK_WINDOW_HOURS,
      created_at: payment.createdAt.toISOString(),
    };
  }

  /**
   * The one-time ₹15 + GST account setup fee (client decision D9).
   *
   * Flat rather than band-priced, so it quotes from `ACCOUNT_SETUP_FEE` and
   * never touches `pricing_config`. D9 makes it the last step before a user may
   * browse or be browsed, which is why it is only offered to a user who has
   * passed verification and is waiting on precisely this.
   */
  async createSetupFeeOrder(
    userId: string,
    idempotencyKey?: string,
  ): Promise<PaymentOrderResponse> {
    const buyer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, setupFeePaidAt: true },
    });
    if (!buyer) throw new NotFoundException('User not found');

    if (buyer.setupFeePaidAt !== null) {
      throw new ConflictException('The setup fee has already been paid.');
    }
    if (buyer.status !== 'AWAITING_SETUP_FEE') {
      // A user still choosing a category or awaiting verification has not
      // reached the step this fee belongs to (D9), so charging them would take
      // money for a state they cannot yet leave.
      throw new ConflictException(
        BLOCKED_PURCHASERS[buyer.status] ?? 'This account cannot pay the setup fee yet.',
      );
    }

    const existing = await this.findByIdempotencyKey(idempotencyKey);
    if (existing) return this.replayOrder(existing);

    const quote = quotePayment(ACCOUNT_SETUP_FEE, GST_PERCENT);

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        purpose: 'SETUP_FEE',
        baseAmount: quote.baseAmount,
        gstRate: quote.gstRate,
        gstAmount: quote.gstAmount,
        totalAmount: quote.totalAmount,
        currency: quote.currency,
        status: 'CREATED',
        idempotencyKey: idempotencyKey ?? null,
      },
      select: { id: true, createdAt: true },
    });

    const gatewayOrder = await this.attachGatewayOrder(payment.id, quote.totalAmount, {
      purpose: 'SETUP_FEE',
    });

    return {
      payment_id: payment.id,
      purpose: 'SETUP_FEE',
      gateway: 'RAZORPAY',
      gateway_order_id: gatewayOrder.gatewayOrderId,
      amount: priceOf(quote),
      created_at: payment.createdAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Webhook — the only path that grants an unlock
  // -------------------------------------------------------------------------

  /**
   * Order of operations is deliberate: verify the signature against the raw
   * body, claim the event, re-verify the amount against the server's snapshot,
   * and only then write.
   */
  async handleWebhook(rawBody: string, signature: string | undefined): Promise<PaymentWebhookAck> {
    if (!this.gateway.verifyWebhookSignature(rawBody, signature)) {
      // No WebhookEvent row: an unverifiable caller may not write anything,
      // including a log row keyed by an id they chose.
      throw new BadRequestException('Invalid webhook signature');
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Webhook body is not valid JSON');
    }

    const event = this.parseWebhook(body);
    if (await this.alreadyHandled(event)) {
      return { received: true, event_id: event.eventId, duplicate: true };
    }

    let paymentId: string | undefined;
    try {
      paymentId = (await this.applyEvent(event)).paymentId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.webhookEvent.update({
        where: { eventId: event.eventId },
        data: { processingError: message },
      });
      // Rethrown so the gateway sees a non-2xx and retries. Leaving
      // processedAt null is what marks the event retryable.
      throw error;
    }

    await this.prisma.webhookEvent.update({
      where: { eventId: event.eventId },
      data: { processedAt: this.clock.now(), paymentId: paymentId ?? null },
    });

    return { received: true, event_id: event.eventId, duplicate: false };
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /**
   * Reconciliation for one of the caller's own payments (section 27).
   *
   * Scoped by `userId` in the query rather than fetched-then-compared, so
   * another user's payment row is never loaded at all.
   */
  async getStatus(userId: string, paymentId: string): Promise<PaymentStatusResponse> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
      include: { unlock: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const now = this.clock.now();
    const amount: UnlockPrice = {
      base_amount: money(payment.baseAmount),
      // gstRate is stored to 4 places (0.1800) and money() rounds to 2, so this
      // one field is read at its own scale instead of through the helper.
      gst_rate: toDecimal(payment.gstRate).toFixed(4),
      gst_amount: money(payment.gstAmount),
      total_amount: money(payment.totalAmount),
      currency: CURRENCY,
    };

    return {
      payment_id: payment.id,
      purpose: payment.purpose,
      status: payment.status,
      amount,
      unlock: payment.unlock
        ? {
            unlocked_at: payment.unlock.unlockedAt.toISOString(),
            unlock_expires_at: payment.unlock.unlockExpiresAt.toISOString(),
            remaining_ms: remainingMs(payment.unlock.unlockExpiresAt, now),
            // Derived from server time rather than echoed from the row: an
            // unlock still marked ACTIVE whose window has closed is reported as
            // EXPIRED. The persisted status is the scheduler's verdict and is
            // only trusted when it is already a non-ACTIVE state.
            status: isUnlockActive(payment.unlock.unlockExpiresAt, now, payment.unlock.status)
              ? 'ACTIVE'
              : payment.unlock.status === 'ACTIVE'
                ? 'EXPIRED'
                : payment.unlock.status,
          }
        : undefined,
      created_at: payment.createdAt.toISOString(),
      paid_at: payment.paidAt?.toISOString() ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private assertCanPurchase(status: string): void {
    if (status === 'ACTIVE') return;
    if (status === 'AWAITING_SETUP_FEE') {
      throw new ConflictException(BLOCKED_PURCHASERS[status]);
    }
    if (status === 'PENDING_CATEGORY' || status === 'PENDING_VERIFICATION') {
      throw new ForbiddenException(BLOCKED_PURCHASERS[status]);
    }
    throw new ForbiddenException(
      BLOCKED_PURCHASERS[status] ?? 'This account cannot make payments.',
    );
  }

  /**
   * The currently active price for a band.
   *
   * `effectiveTo IS NULL` marks the open row, so a price change closes the old
   * row and opens a new one; an order created before the switch keeps quoting
   * from the row it snapshotted (section 29).
   */
  private async quoteForCategory(
    category: string,
  ): Promise<PricingQuote & { pricingConfigId: string | null }> {
    const row = await this.prisma.pricingConfig.findFirst({
      where: { category, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
      select: { id: true, baseAmount: true, gstRate: true },
    });
    if (!row) {
      // An admin has not opened a price for this band. Failing closed is the
      // point: a hard-coded fallback would charge a price nobody approved.
      throw new ServiceUnavailableException('No active price is configured for this category.');
    }

    // gstRate is stored as a fraction and quotePayment takes a percent, so it is
    // converted here rather than in the shared helper — every other caller has
    // a percent.
    return {
      ...quotePayment(row.baseAmount, toDecimal(row.gstRate).mul(100)),
      pricingConfigId: row.id,
    };
  }

  private async findByIdempotencyKey(key?: string): Promise<OrderRow | null> {
    if (!key) return null;
    return this.prisma.payment.findUnique({ where: { idempotencyKey: key } });
  }

  /**
   * Return the order a previous request already created.
   *
   * Section 18 asks for idempotent payment initiation; without this, a client
   * retrying after a timeout would open a second real order and be charged
   * twice.
   */
  private async replayOrder(existing: OrderRow): Promise<PaymentOrderResponse> {
    if (existing.gatewayOrderId === null) {
      // The row exists but the gateway call never completed. The key is unique,
      // so it cannot be reused: the attempt is closed out and the caller must
      // present a fresh key.
      await this.prisma.payment.update({
        where: { id: existing.id },
        data: {
          status: 'FAILED',
          failureCode: FAILURE.gatewayError,
          failureReason: 'The gateway did not return an order for this idempotency key.',
        },
      });
      throw new ConflictException(
        'A previous payment attempt with this idempotency key did not complete. Retry with a new key.',
      );
    }

    return {
      payment_id: existing.id,
      purpose: existing.purpose,
      gateway: 'RAZORPAY',
      gateway_order_id: existing.gatewayOrderId,
      amount: {
        base_amount: money(existing.baseAmount),
        gst_rate: toDecimal(existing.gstRate).toFixed(4),
        gst_amount: money(existing.gstAmount),
        total_amount: money(existing.totalAmount),
        currency: CURRENCY,
      },
      // Present on a replayed unlock order too: the app is about to show the
      // target it is paying for, and dropping it would make a retried order
      // look like a different purchase. The name is not re-read, because a
      // replay must not depend on the profile still existing.
      profile: existing.targetProfileId
        ? { profile_id: existing.targetProfileId, first_name: '' }
        : undefined,
      unlock_window_hours: existing.purpose === 'UNLOCK' ? UNLOCK_WINDOW_HOURS : undefined,
      created_at: existing.createdAt.toISOString(),
    };
  }

  /**
   * Call the gateway and record its order id.
   *
   * The Payment row is written *before* the gateway call so the amount snapshot
   * is captured even if the gateway is unreachable. A row with no
   * `gatewayOrderId` is a visible, reconcilable failure, whereas a gateway order
   * with no local row is money taken with nothing to reconcile against.
   */
  private async attachGatewayOrder(
    paymentId: string,
    totalAmount: string,
    notes: Record<string, string>,
  ): Promise<{ gatewayOrderId: string }> {
    try {
      const order = await this.gateway.createOrder({
        amountMinor: rupeesToMinor(totalAmount),
        currency: CURRENCY,
        receipt: paymentId,
        notes,
      });

      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { gatewayOrderId: order.gatewayOrderId, status: 'PENDING' },
      });
      return { gatewayOrderId: order.gatewayOrderId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Gateway order creation failed for ${paymentId}: ${message}`);
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED', failureCode: FAILURE.gatewayError, failureReason: message },
      });
      throw new ServiceUnavailableException(
        'The payment gateway is unavailable. Try again shortly.',
      );
    }
  }

  /**
   * Has this exact event already been processed?
   *
   * The event key is derived in `parseWebhook`; the unique index on `eventId`
   * is what actually prevents a concurrent double-insert, and the status guard
   * inside `applyEvent` covers the rest.
   */
  private async alreadyHandled(event: ParsedWebhook): Promise<boolean> {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { eventId: event.eventId },
      select: { processedAt: true },
    });
    if (existing?.processedAt) return true;

    if (!existing) {
      try {
        await this.prisma.webhookEvent.create({
          data: {
            provider: 'RAZORPAY',
            eventId: event.eventId,
            eventType: event.eventType,
            payload: event.payload,
          },
        });
      } catch (error) {
        // Another delivery inserted the same event first. Its runner owns the
        // work; this one continues and is stopped by the status guard.
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return false;
  }

  /**
   * Reduce the delivery to the fields this service acts on.
   *
   * Razorpay sends no per-delivery identifier: every capture of every payment
   * arrives with `event: "payment.captured"`. Using that as the idempotency key
   * would collapse the whole system onto one event, so the key is composed with
   * the entity id — which *is* stable across Razorpay's retries, because a retry
   * re-delivers the same payment object.
   */
  private parseWebhook(body: unknown): ParsedWebhook {
    const record = asRecord(body);
    const eventType = typeof record.event === 'string' ? record.event : '';
    const entity = asRecord(asRecord(record.payload).entity);
    const entityId = typeof entity.id === 'string' ? entity.id : '';

    if (eventType === '' || entityId === '') {
      // Without both there is no way to make a stable idempotency key, so the
      // delivery cannot be safely processed at all.
      throw new BadRequestException('Webhook is missing an event type or entity id');
    }

    const isOrderPaid = eventType === GATEWAY_EVENTS.orderPaid;
    const orderId = isOrderPaid
      ? entityId
      : typeof entity.order_id === 'string'
        ? entity.order_id
        : undefined;

    // `payment.captured` reports what was actually taken; `order.paid` reports
    // what the order was settled for. Both are compared to the snapshot, because
    // either alone can be the only delivery the gateway sends.
    const rawAmount = isOrderPaid
      ? entity.amount_paid
      : eventType === GATEWAY_EVENTS.captured
        ? entity.amount_received
        : undefined;

    return {
      eventId: `${eventType}:${entityId}`,
      eventType,
      payload: body as Prisma.InputJsonValue,
      orderId,
      amountMinor: toMinor(rawAmount),
      currency: typeof entity.currency === 'string' ? entity.currency : undefined,
      method: typeof entity.method === 'string' ? entity.method : undefined,
      gatewayPaymentId: isOrderPaid ? undefined : entityId,
      failureCode: typeof entity.error_code === 'string' ? entity.error_code : undefined,
      failureReason:
        typeof entity.error_description === 'string' ? entity.error_description : undefined,
    };
  }

  private async applyEvent(event: ParsedWebhook): Promise<{ paymentId?: string }> {
    if (
      event.eventType === GATEWAY_EVENTS.captured ||
      event.eventType === GATEWAY_EVENTS.orderPaid
    ) {
      return this.grant(event);
    }
    if (event.eventType === GATEWAY_EVENTS.failed) {
      return this.markFailed(event);
    }
    // Anything else is recorded and acknowledged. A provider adding an event
    // type must not become an outage or an endless retry loop.
    this.logger.log(`Ignoring unhandled gateway event ${event.eventType}`);
    return {};
  }

  /**
   * Confirm a captured payment and grant what it bought.
   *
   * Returns an empty result — rather than throwing — when the delivery is
   * definitively ungrantable (no matching local payment, or an amount that does
   * not match the snapshot). Retrying either cannot change the answer, and a
   * gateway that is retried until it gives up will eventually disable the
   * webhook.
   */
  private async grant(event: ParsedWebhook): Promise<{ paymentId?: string }> {
    const payment = event.orderId
      ? await this.prisma.payment.findUnique({ where: { gatewayOrderId: event.orderId } })
      : null;

    if (!payment) {
      this.logger.warn(
        `No local payment for gateway order ${event.orderId ?? 'unknown'}; nothing granted.`,
      );
      return {};
    }

    // Section 40: the amount must be verified against server-side order data.
    // The gateway's number is only ever compared, never written into the total.
    const expectedMinor = rupeesToMinor(payment.totalAmount);
    const currencyMismatch = event.currency !== undefined && event.currency !== payment.currency;
    if (
      currencyMismatch ||
      event.amountMinor === undefined ||
      event.amountMinor !== expectedMinor
    ) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureCode: FAILURE.amountMismatch,
          failureReason:
            `Gateway reported ${event.amountMinor ?? 'no amount'} ${event.currency ?? payment.currency}; ` +
            `server snapshot is ${expectedMinor} ${payment.currency}.`,
        },
      });
      this.logger.error(`Amount mismatch on payment ${payment.id}; no unlock granted.`);
      return { paymentId: payment.id };
    }

    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      // The transition is guarded rather than the insert. Two distinct event
      // keys can resolve to one payment (a capture and an order-paid for the
      // same order), and whichever loses the race finds count 0 and does
      // nothing — which is what makes ContactUnlock.paymentId unique a
      // backstop rather than the first line of defence.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ['CREATED', 'PENDING'] } },
        data: {
          status: 'SUCCESS',
          paidAt: now,
          amountVerifiedAt: now,
          gatewayPaymentId: event.gatewayPaymentId ?? null,
          gatewayMethod: event.method ?? null,
        },
      });
      if (claimed.count === 0) {
        this.logger.warn(
          `Payment ${payment.id} was already settled; ignoring repeat event ${event.eventId}.`,
        );
        return;
      }

      if (payment.purpose === 'SETUP_FEE') {
        await this.activateAccount(tx, payment, now);
      } else {
        await this.createUnlock(tx, payment, now);
      }
    });

    return { paymentId: payment.id };
  }

  /**
   * A failed payment is terminal for that order but not for the user: they may
   * start a new order. Marking it FAILED rather than deleting it is what section
   * 18's reconciliation reads.
   */
  private async markFailed(event: ParsedWebhook): Promise<{ paymentId?: string }> {
    if (!event.orderId) return {};

    const payment = await this.prisma.payment.findUnique({
      where: { gatewayOrderId: event.orderId },
    });
    if (!payment) return {};

    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ['CREATED', 'PENDING'] } },
      data: {
        status: 'FAILED',
        failureCode: event.failureCode ?? FAILURE.gatewayError,
        failureReason: event.failureReason ?? 'The gateway reported a failed payment.',
      },
    });
    return { paymentId: payment.id };
  }

  /**
   * D9: paying the setup fee is what makes an account active.
   *
   * Guarded on the current status so a payment captured against an account that
   * was suspended or deleted in the meantime cannot silently reactivate it. The
   * money stays recorded on the Payment either way; the refund decision belongs
   * to section 18 reconciliation, not to a webhook.
   */
  private async activateAccount(tx: Tx, payment: OrderRow, now: Date): Promise<void> {
    const activated = await tx.user.updateMany({
      where: { id: payment.userId, status: 'AWAITING_SETUP_FEE' },
      data: {
        setupFeePaidAt: now,
        setupFeePaymentId: payment.id,
        status: 'ACTIVE',
        statusChangedAt: now,
      },
    });
    if (activated.count === 0) {
      this.logger.warn(
        `Setup fee paid for user ${payment.userId}, who is no longer AWAITING_SETUP_FEE; account state left alone.`,
      );
    }
  }

  /**
   * The 24-hour disclosure window, from server time only (section 15).
   *
   * GAP-1 is unresolved in docs/decisions: a profile deleted or paused between
   * order and capture means the buyer pays and receives nothing. The payment is
   * left SUCCESS because the gateway did take the money — misreporting it would
   * corrupt reconciliation — and no unlock is created, because a ContactUnlock
   * row is a promise of contact access that cannot be kept. The reason is
   * recorded on the Payment for whoever handles the refund.
   */
  private async createUnlock(tx: Tx, payment: OrderRow, now: Date): Promise<void> {
    const target = payment.targetProfileId
      ? await tx.profile.findUnique({
          where: { id: payment.targetProfileId },
          select: { id: true, status: true, visibility: true, deletedAt: true },
        })
      : null;

    if (
      !target ||
      target.status !== 'APPROVED' ||
      target.visibility !== 'ACTIVE' ||
      target.deletedAt !== null
    ) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          failureCode: FAILURE.targetUnavailable,
          failureReason:
            'The profile was deleted, paused or withdrawn between order and payment. No contact was disclosed.',
        },
      });
      this.logger.error(
        `Payment ${payment.id} captured but its target profile is unavailable (GAP-1).`,
      );
      return;
    }

    const { unlockedAt, unlockExpiresAt } = computeUnlockWindow(now);
    await tx.contactUnlock.create({
      data: {
        userId: payment.userId,
        profileId: target.id,
        paymentId: payment.id,
        unlockedAt,
        unlockExpiresAt,
        status: 'ACTIVE',
      },
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * `quotePayment` speaks camelCase and the wire contract speaks snake_case.
 *
 * The mapping lives here rather than being written out at each call site so the
 * price returned in an order, a replay and a status read cannot drift apart from
 * each other or from the shape the app validates against.
 */
function priceOf(quote: {
  baseAmount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
  currency: string;
}): UnlockPrice {
  return {
    base_amount: quote.baseAmount,
    gst_rate: quote.gstRate,
    gst_amount: quote.gstAmount,
    total_amount: quote.totalAmount,
    currency: quote.currency as UnlockPrice['currency'],
  };
}

/**
 * The gateway's amount, as a whole number of minor units.
 *
 * Undefined rather than NaN when absent or unusable: the caller compares against
 * a snapshot, and a missing amount must fail that comparison rather than
 * silently coerce to zero.
 */
function toMinor(value: unknown): number | undefined {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Section 40's uniqueness signal. Identified by code rather than by class so the
 * check survives the Prisma driver adapter, which does not always construct the
 * same error class across versions.
 */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
