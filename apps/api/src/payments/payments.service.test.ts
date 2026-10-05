/**
 * Payments service tests.
 *
 * These are the tests that matter most in the codebase, because the rules being
 * checked are the ones whose failure is invisible: an overcharge, a forged
 * capture, or a duplicated unlock all leave a perfectly plausible row behind.
 *
 * The fake database implements only the methods `PaymentsService` actually calls
 * and throws on anything else, so a query change that silently drops a
 * predicate fails here instead of passing against a double that ignores it.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { createHmac } from 'node:crypto';
import { PaymentsService } from './payments.service';
import { PaymentGateway, type CreateGatewayOrderInput, type GatewayOrder } from './payment.gateway';
import { FrozenClock } from '../common/clock/clock.service';
import { VisibilityPreferenceService } from '../discovery/visibility-preference.service';
import { PaymentOrderSchema, UNLOCK_WINDOW_HOURS } from '@matrimony/shared';

const WEBHOOK_SECRET = 'whsec_unit_test_secret';

type SeedUser = {
  id: string;
  status: string;
  setupFeePaidAt: Date | null;
  networthCategory: string;
};

type SeedProfile = {
  id: string;
  userId: string;
  firstName: string;
  status: string;
  visibility: string;
  deletedAt: Date | null;
};

type PaymentRow = {
  id: string;
  userId: string;
  purpose: 'UNLOCK' | 'SETUP_FEE';
  category: string | null;
  targetProfileId: string | null;
  baseAmount: Decimal;
  gstRate: Decimal;
  gstAmount: Decimal;
  totalAmount: Decimal;
  currency: string;
  pricingConfigId: string | null;
  status: string;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  gatewayMethod: string | null;
  amountVerifiedAt: Date | null;
  failureCode: string | null;
  failureReason: string | null;
  paidAt: Date | null;
  idempotencyKey: string | null;
  createdAt: Date;
  unlock?: UnlockRow | null;
};

type UnlockRow = {
  id: string;
  userId: string;
  profileId: string;
  paymentId: string;
  unlockedAt: Date;
  unlockExpiresAt: Date;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
};

type WebhookRow = {
  eventId: string;
  eventType: string;
  payload: unknown;
  processedAt: Date | null;
  paymentId: string | null;
  processingError: string | null;
};

/** Mirrors the part of Prisma the service uses, in memory. */
class FakePrisma {
  users: SeedUser[] = [];
  profiles: SeedProfile[] = [];
  payments: PaymentRow[] = [];
  unlocks: UnlockRow[] = [];
  webhooks: WebhookRow[] = [];
  pricing: {
    id: string;
    category: string;
    baseAmount: Decimal;
    gstRate: Decimal;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }[] = [];
  private seq = 0;

  user = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.users.find((u) => u.id === where.id) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; status?: string };
      data: Record<string, unknown>;
    }) => {
      const row = this.users.find(
        (u) => u.id === where.id && (where.status === undefined || u.status === where.status),
      );
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };

  profile = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const p = this.profiles.find((x) => x.id === where.id);
      if (!p) return null;
      const owner = this.users.find((u) => u.id === p.userId);
      return {
        ...p,
        user: owner ? { id: owner.id, networthCategory: owner.networthCategory } : null,
      };
    },
  };

  pricingConfig = {
    findFirst: async ({ where }: { where: { category: string; effectiveTo: null } }) => {
      const open = this.pricing
        .filter((p) => p.category === where.category && p.effectiveTo === null)
        .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
      return open[0] ?? null;
    },
  };

  payment = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (data.idempotencyKey) {
        const clash = this.payments.find((p) => p.idempotencyKey === data.idempotencyKey);
        if (clash) throw new Error('P2002');
      }
      const row = {
        id: `pay_${++this.seq}`,
        gatewayOrderId: null,
        gatewayPaymentId: null,
        gatewayMethod: null,
        amountVerifiedAt: null,
        failureCode: null,
        failureReason: null,
        paidAt: null,
        status: 'CREATED',
        createdAt: new Date('2026-10-04T10:00:00.000Z'),
        ...data,
      } as unknown as PaymentRow;
      // The service hands over money as a string (Prisma accepts either); the
      // driver would hand back a Decimal, so the fake does the same. Without
      // this the fake is more permissive than the database and hides any code
      // that assumes a Decimal method exists.
      for (const field of ['baseAmount', 'gstRate', 'gstAmount', 'totalAmount'] as const) {
        const value = row[field];
        if (typeof value === 'string') {
          (row as unknown as Record<string, unknown>)[field] = new Decimal(value);
        }
      }
      this.payments.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      if (typeof where.idempotencyKey === 'string') {
        return this.payments.find((p) => p.idempotencyKey === where.idempotencyKey) ?? null;
      }
      if (typeof where.gatewayOrderId === 'string') {
        return this.payments.find((p) => p.gatewayOrderId === where.gatewayOrderId) ?? null;
      }
      return null;
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      // Both shapes the service uses: by id, and the idempotency lookup that is
      // scoped by user as well as key. A fake that matched the key alone would
      // not catch a regression that let one user's order replay for another.
      if (typeof where.idempotencyKey === 'string') {
        return (
          this.payments.find(
            (p) =>
              p.idempotencyKey === where.idempotencyKey &&
              (where.userId === undefined || p.userId === where.userId),
          ) ?? null
        );
      }
      if (typeof where.id === 'string') {
        return (
          this.payments.find(
            (p) => p.id === where.id && (where.userId === undefined || p.userId === where.userId),
          ) ?? null
        );
      }
      return null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = this.payments.find((p) => p.id === where.id);
      if (!row) throw new Error(`no payment ${where.id}`);
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; status?: { in: string[] } };
      data: Record<string, unknown>;
    }) => {
      const row = this.payments.find(
        (p) =>
          p.id === where.id && (where.status === undefined || where.status.in.includes(p.status)),
      );
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };

  webhookEvent = {
    findUnique: async ({ where }: { where: { eventId: string } }) =>
      this.webhooks.find((w) => w.eventId === where.eventId) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (this.webhooks.some((w) => w.eventId === data.eventId)) throw new Error('P2002');
      const row = {
        processedAt: null,
        paymentId: null,
        processingError: null,
        ...data,
      } as unknown as WebhookRow;
      this.webhooks.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { eventId: string };
      data: Record<string, unknown>;
    }) => {
      const row = this.webhooks.find((w) => w.eventId === where.eventId);
      if (!row) throw new Error(`no webhook ${where.eventId}`);
      Object.assign(row, data);
      return row;
    },
  };

  contactUnlock = {
    create: async ({ data }: { data: Omit<UnlockRow, 'id'> }) => {
      if (this.unlocks.some((u) => u.paymentId === data.paymentId))
        throw new Error('P2002 on paymentId');
      const row = { id: `unlock_${++this.seq}`, ...data };
      this.unlocks.push(row);
      const payment = this.payments.find((p) => p.id === data.paymentId);
      if (payment) payment.unlock = row;
      return row;
    },
  };

  $transaction = async <T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> => fn(this);
}

/** Records what the service asked the gateway for. */
class FakeGateway extends PaymentGateway {
  created: CreateGatewayOrderInput[] = [];
  failNext = false;

  constructor(private readonly secret: string) {
    super();
  }

  override verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (typeof signature !== 'string') return false;
    const expected = createHmac('sha256', this.secret)
      .update(`${rawBody}|${this.secret}`)
      .digest('hex');
    return expected === signature;
  }

  override async createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrder> {
    this.created.push(input);
    if (this.failNext) throw new Error('gateway down');
    return {
      gatewayOrderId: `order_${this.created.length}`,
      amountMinor: input.amountMinor,
      currency: input.currency,
    };
  }

  sign(body: string): string {
    return createHmac('sha256', this.secret).update(`${body}|${this.secret}`).digest('hex');
  }
}

const BUYER = 'user_buyer';
const TARGET = 'user_target';

function seed(prisma: FakePrisma, overrides?: { buyerStatus?: string }): void {
  prisma.users.push(
    {
      id: BUYER,
      status: overrides?.buyerStatus ?? 'ACTIVE',
      setupFeePaidAt: new Date('2026-10-01'),
      networthCategory: 'BELOW_2CR',
    },
    {
      id: TARGET,
      status: 'ACTIVE',
      setupFeePaidAt: new Date('2026-10-01'),
      networthCategory: 'BELOW_2CR',
    },
  );
  prisma.profiles.push({
    id: 'profile_target',
    userId: TARGET,
    firstName: 'Asha',
    status: 'APPROVED',
    visibility: 'ACTIVE',
    deletedAt: null,
  });
  prisma.pricing.push({
    id: 'price_1',
    category: 'BELOW_2CR',
    baseAmount: new Decimal('99.00'),
    gstRate: new Decimal('0.1800'),
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
  });
}

async function makeService() {
  const prisma = new FakePrisma();
  const gateway = new FakeGateway(WEBHOOK_SECRET);
  const clock = new FrozenClock(new Date('2026-10-04T12:00:00.000Z'));
  const preferences = {
    isDiscoverableBy: async () => true,
  } as unknown as VisibilityPreferenceService;

  const service = new PaymentsService(prisma as never, clock, gateway, preferences);
  return { service, prisma, gateway, clock, preferences };
}

/** A captured-payment webhook body, signed and ready to deliver. */
function capture(
  gateway: FakeGateway,
  orderId: string,
  amountMinor: number,
  extra: Record<string, unknown> = {},
) {
  const body = JSON.stringify({
    event: 'payment.captured',
    payload: {
      entity: {
        id: 'pay_gateway_1',
        entity: 'payment',
        order_id: orderId,
        amount_received: amountMinor,
        currency: 'INR',
        method: 'upi',
        status: 'captured',
        ...extra,
      },
    },
  });
  return { body, signature: gateway.sign(body) };
}

describe('PaymentsService — order creation', () => {
  it('prices the unlock from pricing_config and sends paise to the gateway', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);

    const order = await service.createUnlockOrder(BUYER, 'profile_target');

    // 99.00 base + 18% GST = 116.82, and the gateway must receive 11682 paise.
    // Sending "116.82" would be a 100x undercharge that still looks correct in
    // the API response.
    expect(order.amount.total_amount).toBe('116.82');
    expect(gateway.created[0].amountMinor).toBe(11682);
    expect(order.gateway_order_id).toBe('order_1');
    expect(order.profile).toEqual({ profile_id: 'profile_target', first_name: 'Asha' });

    const payment = prisma.payments[0];
    expect(payment.status).toBe('PENDING');
    expect(payment.gatewayOrderId).toBe('order_1');
    // The snapshot is what a later price change must not alter.
    expect(payment.totalAmount.toFixed(2)).toBe('116.82');
    expect(payment.pricingConfigId).toBe('price_1');
    expect(payment.targetProfileId).toBe('profile_target');
  });

  it('never takes the amount from the client', async () => {
    const { service, prisma } = await makeService();
    seed(prisma);
    // The request type has no amount field at all; this asserts the schema
    // stays that way by checking the price is derived from the band.
    await service.createUnlockOrder(BUYER, 'profile_target', 'idem-1');
    expect(prisma.payments[0].baseAmount.toFixed(2)).toBe('99.00');
  });

  it('refuses a buyer who has not paid the setup fee (D9)', async () => {
    const { service, prisma } = await makeService();
    seed(prisma, { buyerStatus: 'AWAITING_SETUP_FEE' });

    await expect(service.createUnlockOrder(BUYER, 'profile_target')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.payments).toHaveLength(0);
    expect(prisma.unlocks).toHaveLength(0);
  });

  it('refuses a buyer who has not been verified', async () => {
    const { service, prisma } = await makeService();
    seed(prisma, { buyerStatus: 'PENDING_VERIFICATION' });

    await expect(service.createUnlockOrder(BUYER, 'profile_target')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('hides a profile outside the visibility scope behind the same 404', async () => {
    const { service, prisma, preferences } = await makeService();
    seed(prisma);
    (preferences as unknown as { isDiscoverableBy: () => Promise<boolean> }).isDiscoverableBy =
      async () => false;

    // Same exception and same message as a profile that does not exist, so the
    // endpoint is not an existence oracle for ids outside the caller's scope.
    await expect(service.createUnlockOrder(BUYER, 'profile_target')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.createUnlockOrder(BUYER, 'does_not_exist')).rejects.toThrow(
      'Profile not found',
    );
  });

  it('refuses a withdrawn profile', async () => {
    const { service, prisma } = await makeService();
    seed(prisma);
    prisma.profiles[0].visibility = 'PAUSED';

    await expect(service.createUnlockOrder(BUYER, 'profile_target')).rejects.toThrow(
      'Profile not found',
    );
  });

  it('refuses to let a user unlock their own profile', async () => {
    const { service, prisma } = await makeService();
    seed(prisma);
    prisma.profiles[0].userId = BUYER;

    await expect(service.createUnlockOrder(BUYER, 'profile_target')).rejects.toThrow(
      'Profile not found',
    );
  });

  it('reuses the same order when an idempotency key is replayed', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);

    const first = await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key');
    const second = await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key');

    expect(second.gateway_order_id).toBe(first.gateway_order_id);
    expect(second.payment_id).toBe(first.payment_id);
    // One payment, one gateway call: a retried request must not be chargeable
    // twice.
    expect(prisma.payments).toHaveLength(1);
    expect(gateway.created).toHaveLength(1);
  });

  // A client retries precisely when it does not know whether its first attempt
  // landed, which is exactly when the world has moved on underneath it. These
  // tests pin that a retry still finds the order it already has.
  describe('idempotent replay when the world has moved on', () => {
    /** A user at the setup-fee step, which is where the fee is offered. */
    function seedAwaitingFee(prisma: FakePrisma): string {
      const id = 'user_fee';
      prisma.users.push({
        id,
        status: 'AWAITING_SETUP_FEE',
        setupFeePaidAt: null,
        networthCategory: 'BELOW_2CR',
      });
      return id;
    }

    it('replays an unlock order after the target profile disappears', async () => {
      const { service, prisma, gateway } = await makeService();
      seed(prisma);

      const first = await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key');
      // The target is deleted between the request and the retry.
      prisma.profiles.length = 0;

      const second = await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key');

      // Checking eligibility first would have answered this with a 404, leaving
      // the caller unable to find the order it already has.
      expect(second.payment_id).toBe(first.payment_id);
      expect(gateway.created).toHaveLength(1);
    });

    it('replays a setup fee order after the fee has already been paid', async () => {
      const { service, prisma, gateway } = await makeService();
      const feeUser = seedAwaitingFee(prisma);

      const first = await service.createSetupFeeOrder(feeUser, 'fee-key');
      // The successful path itself flips these, so the guards below the
      // idempotency check would reject the retry with "already paid".
      const user = prisma.users.find((u) => u.id === feeUser)!;
      user.setupFeePaidAt = new Date();
      user.status = 'ACTIVE';

      const second = await service.createSetupFeeOrder(feeUser, 'fee-key');

      expect(second.payment_id).toBe(first.payment_id);
      expect(gateway.created).toHaveLength(1);
    });

    it('replays an unlock order after the target pauses visibility', async () => {
      const { service, prisma } = await makeService();
      seed(prisma);

      const first = await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key');
      prisma.profiles[0].visibility = 'PAUSED';

      expect(
        (await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key')).payment_id,
      ).toBe(first.payment_id);
    });

    it('returns a replayed unlock order that satisfies the payment contract', async () => {
      const { service, prisma } = await makeService();
      seed(prisma);
      await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key');

      const replay = await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key');

      // Regression: the replay used to echo `first_name: ''`, which fails
      // `min(1)` and would be rejected by any client validating the response.
      expect(PaymentOrderSchema.parse(replay)).toEqual(replay);
      expect(replay.profile).toEqual({ profile_id: 'profile_target', first_name: 'Asha' });
    });

    it('omits the target on a replay when the profile is gone', async () => {
      const { service, prisma } = await makeService();
      seed(prisma);
      await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key');
      prisma.profiles.length = 0;

      const replay = await service.createUnlockOrder(BUYER, 'profile_target', 'idem-key');

      // An order has to be able to outlive its target (the GAP-1 case). Inventing
      // a name would tell the buyer they are paying for a profile that is gone.
      expect(replay.profile).toBeUndefined();
      expect(PaymentOrderSchema.parse(replay)).toEqual(replay);
    });

    it("never replays another user's order for a colliding key", async () => {
      const { service, prisma, gateway } = await makeService();
      seed(prisma);
      prisma.users.push({
        id: 'user_third',
        status: 'ACTIVE',
        setupFeePaidAt: new Date('2026-10-01'),
        networthCategory: 'BELOW_2CR',
      });

      const buyers = await service.createUnlockOrder(BUYER, 'profile_target', 'collide');

      // `idempotencyKey` is globally unique, so a lookup by key alone would hand
      // this caller someone else's payment id and gateway order id. Keys are
      // generated, not secrets, so this must not depend on them being secret.
      await expect(
        service.createUnlockOrder('user_third', 'profile_target', 'collide'),
      ).rejects.toThrow();
      expect(gateway.created).toHaveLength(1);
      expect(prisma.payments).toHaveLength(1);
      expect(buyers.payment_id).not.toBe('pay_2');
    });

    it('refuses a key already used for a different target', async () => {
      const { service, prisma } = await makeService();
      seed(prisma);
      prisma.profiles.push({
        id: 'profile_two',
        userId: TARGET,
        firstName: 'Bela',
        status: 'APPROVED',
        visibility: 'ACTIVE',
        deletedAt: null,
      });
      await service.createUnlockOrder(BUYER, 'profile_target', 'shared-key');

      // Replaying the first target's order here would be a plausible-looking 200
      // answering the wrong question.
      await expect(service.createUnlockOrder(BUYER, 'profile_two', 'shared-key')).rejects.toThrow(
        'already used for a different payment',
      );
    });

    it('refuses to answer the unlock endpoint with a setup-fee order', async () => {
      const { service, prisma } = await makeService();
      seed(prisma);
      const feeUser = seedAwaitingFee(prisma);
      await service.createSetupFeeOrder(feeUser, 'cross-key');

      // The same caller, reusing their key for a different purpose. Because the
      // idempotency check runs ahead of the eligibility guards, this is reported
      // as the conflict it is rather than masked by an eligibility error.
      await expect(
        service.createUnlockOrder(feeUser, 'profile_target', 'cross-key'),
      ).rejects.toThrow('already used for a different payment');
    });

    it("rejects another user's colliding key rather than replaying their order", async () => {
      const { service, prisma } = await makeService();
      seed(prisma);
      prisma.users.push({
        id: 'user_third',
        status: 'ACTIVE',
        setupFeePaidAt: new Date('2026-10-01'),
        networthCategory: 'BELOW_2CR',
      });
      await service.createUnlockOrder(BUYER, 'profile_target', 'collide');

      // A user-scoped lookup finds nothing here, so the globally unique key
      // catches the collision downstream. The important part is that it is a
      // rejection, not the other account's order.
      await expect(
        service.createUnlockOrder('user_third', 'profile_target', 'collide'),
      ).rejects.toThrow();
      expect(prisma.payments).toHaveLength(1);
    });
  });

  it('fails closed when a band has no active price', async () => {
    const { service, prisma } = await makeService();
    seed(prisma);
    prisma.pricing = [];

    await expect(service.createUnlockOrder(BUYER, 'profile_target')).rejects.toThrow(
      'No active price is configured',
    );
    // No hard-coded fallback amount may be charged.
    expect(prisma.payments).toHaveLength(0);
  });

  it('quotes the flat setup fee with GST on top (15 -> 17.70)', async () => {
    const { service, prisma, gateway } = await makeService();
    prisma.users.push({
      id: 'user_setup',
      status: 'AWAITING_SETUP_FEE',
      setupFeePaidAt: null,
      networthCategory: 'BELOW_2CR',
    });
    seed(prisma);

    const order = await service.createSetupFeeOrder('user_setup');

    expect(order.amount.base_amount).toBe('15.00');
    expect(order.amount.total_amount).toBe('17.70');
    expect(gateway.created[0].amountMinor).toBe(1770);
  });

  it('refuses a setup fee from a user who has not been verified yet', async () => {
    const { service, prisma } = await makeService();
    prisma.users.push({
      id: 'user_setup',
      status: 'PENDING_VERIFICATION',
      setupFeePaidAt: null,
      networthCategory: 'ABOVE_10CR',
    });
    seed(prisma);

    // Charging now would take money for a state the user cannot yet leave.
    await expect(service.createSetupFeeOrder('user_setup')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('PaymentsService — webhook', () => {
  it('grants a 24-hour unlock on a verified capture', async () => {
    const { service, prisma, gateway, clock } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');

    const { body, signature } = capture(gateway, 'order_1', 11682);
    const ack = await service.handleWebhook(body, signature);

    expect(ack).toEqual({
      received: true,
      event_id: 'payment.captured:pay_gateway_1',
      duplicate: false,
    });

    const payment = prisma.payments[0];
    expect(payment.status).toBe('SUCCESS');
    expect(payment.paidAt).toEqual(clock.now());
    expect(payment.amountVerifiedAt).toEqual(clock.now());

    expect(prisma.unlocks).toHaveLength(1);
    const unlock = prisma.unlocks[0];
    expect(unlock.userId).toBe(BUYER);
    expect(unlock.profileId).toBe('profile_target');
    // Section 15: 24 hours from server time, one instant for both endpoints.
    expect(unlock.unlockedAt.toISOString()).toBe('2026-10-04T12:00:00.000Z');
    expect(unlock.unlockExpiresAt.toISOString()).toBe('2026-10-05T12:00:00.000Z');
    expect(unlock.unlockExpiresAt.getTime() - unlock.unlockedAt.getTime()).toBe(
      UNLOCK_WINDOW_HOURS * 3_600_000,
    );
  });

  it('refuses a capture whose amount does not match the server snapshot', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');

    // 116.82 is what is owed. Anything else — a tampered client, a stale price,
    // a forged capture — must produce no contact access.
    const { body, signature } = capture(gateway, 'order_1', 1);
    await service.handleWebhook(body, signature);

    expect(prisma.unlocks).toHaveLength(0);
    expect(prisma.payments[0].status).toBe('FAILED');
    expect(prisma.payments[0].failureCode).toBe('AMOUNT_MISMATCH');
  });

  it('refuses a capture in the wrong currency', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');

    const { body, signature } = capture(gateway, 'order_1', 11682, { currency: 'USD' });
    await service.handleWebhook(body, signature);

    expect(prisma.unlocks).toHaveLength(0);
    expect(prisma.payments[0].failureCode).toBe('AMOUNT_MISMATCH');
  });

  it('rejects an unsigned body and writes nothing at all', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');

    const { body } = capture(gateway, 'order_1', 11682);
    await expect(service.handleWebhook(body, 'forged-signature')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.unlocks).toHaveLength(0);
    expect(prisma.webhooks).toHaveLength(0);
    expect(prisma.payments[0].status).toBe('PENDING');
  });

  it('ignores a redelivery of the same event', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');

    const { body, signature } = capture(gateway, 'order_1', 11682);
    await service.handleWebhook(body, signature);
    const second = await service.handleWebhook(body, signature);

    expect(second.duplicate).toBe(true);
    // The replay must not create a second unlock even though it arrived after
    // the first one committed.
    expect(prisma.unlocks).toHaveLength(1);
  });

  it('ignores order.paid when the capture already settled the payment', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');

    const captured = capture(gateway, 'order_1', 11682);
    await service.handleWebhook(captured.body, captured.signature);

    // Razorpay sends both events for one payment. They have different entity
    // ids, so the event key differs and only the payment status guard stops a
    // second unlock.
    const paidBody = JSON.stringify({
      event: 'order.paid',
      payload: {
        entity: {
          id: 'order_1',
          entity: 'order',
          amount_paid: 11682,
          currency: 'INR',
          status: 'paid',
        },
      },
    });
    await service.handleWebhook(paidBody, gateway.sign(paidBody));

    expect(prisma.unlocks).toHaveLength(1);
  });

  it('records a failed payment without granting anything', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');

    const body = JSON.stringify({
      event: 'payment.failed',
      payload: {
        entity: {
          id: 'pay_gateway_bad',
          order_id: 'order_1',
          error_code: 'BAD_CARD_ERROR',
          error_description: 'card declined',
          currency: 'INR',
        },
      },
    });
    await service.handleWebhook(body, gateway.sign(body));

    expect(prisma.unlocks).toHaveLength(0);
    expect(prisma.payments[0].status).toBe('FAILED');
    expect(prisma.payments[0].failureCode).toBe('BAD_CARD_ERROR');
  });

  it('activates the account on a setup fee capture and never mints an unlock', async () => {
    const { service, prisma, gateway } = await makeService();
    prisma.users.push({
      id: 'user_setup',
      status: 'AWAITING_SETUP_FEE',
      setupFeePaidAt: null,
      networthCategory: 'BELOW_2CR',
    });
    seed(prisma);
    await service.createSetupFeeOrder('user_setup');

    const { body, signature } = capture(gateway, 'order_1', 1770);
    await service.handleWebhook(body, signature);

    const user = prisma.users.find((u) => u.id === 'user_setup');
    expect(user?.status).toBe('ACTIVE');
    expect(user?.setupFeePaidAt).toBeInstanceOf(Date);
    // The setup fee is a platform charge, never a contact disclosure.
    expect(prisma.unlocks).toHaveLength(0);
  });

  it('does not reactivate an account that was suspended mid-payment', async () => {
    const { service, prisma, gateway } = await makeService();
    prisma.users.push({
      id: 'user_setup',
      status: 'AWAITING_SETUP_FEE',
      setupFeePaidAt: null,
      networthCategory: 'BELOW_2CR',
    });
    seed(prisma);
    await service.createSetupFeeOrder('user_setup');
    prisma.users.find((u) => u.id === 'user_setup')!.status = 'SUSPENDED';

    const { body, signature } = capture(gateway, 'order_1', 1770);
    await service.handleWebhook(body, signature);

    expect(prisma.users.find((u) => u.id === 'user_setup')?.status).toBe('SUSPENDED');
    expect(prisma.payments[0].status).toBe('SUCCESS');
  });

  it('keeps the money but grants no contact when the target vanished (GAP-1)', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');

    // Deleted between order and capture. The payment genuinely succeeded, so it
    // is recorded as such for reconciliation, but a ContactUnlock row would
    // promise contact access that cannot be delivered.
    prisma.profiles[0].deletedAt = new Date('2026-10-04T11:00:00.000Z');

    const { body, signature } = capture(gateway, 'order_1', 11682);
    await service.handleWebhook(body, signature);

    expect(prisma.unlocks).toHaveLength(0);
    expect(prisma.payments[0].status).toBe('SUCCESS');
    expect(prisma.payments[0].failureCode).toBe('TARGET_UNAVAILABLE');
  });

  it('acknowledges an event type it does not handle', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');

    const body = JSON.stringify({
      event: 'subscription.activated',
      payload: { entity: { id: 'sub_1' } },
    });
    const ack = await service.handleWebhook(body, gateway.sign(body));

    // A provider adding an event must not become an outage or a retry storm.
    expect(ack.received).toBe(true);
    expect(prisma.unlocks).toHaveLength(0);
  });

  it('rejects a body that is not JSON after a valid signature', async () => {
    const { service, gateway } = await makeService();
    const body = 'not json';
    await expect(service.handleWebhook(body, gateway.sign(body))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a delivery with no entity id, since it has no stable idempotency key', async () => {
    const { service, gateway } = await makeService();
    const body = JSON.stringify({ event: 'payment.captured', payload: { entity: {} } });
    await expect(service.handleWebhook(body, gateway.sign(body))).rejects.toThrow(
      /event type or entity id/,
    );
  });

  it('does nothing for a capture against an order it never created', async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);

    const { body, signature } = capture(gateway, 'order_unknown', 11682);
    await service.handleWebhook(body, signature);

    expect(prisma.unlocks).toHaveLength(0);
    expect(prisma.payments).toHaveLength(0);
  });
});

describe('PaymentsService — status', () => {
  it('returns the window and remaining time from server time', async () => {
    const { service, prisma, gateway, clock } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');
    const captured = capture(gateway, 'order_1', 11682);
    await service.handleWebhook(captured.body, captured.signature);

    clock.advance(3_600_000);
    const status = await service.getStatus(BUYER, prisma.payments[0].id);

    expect(status.status).toBe('SUCCESS');
    expect(status.unlock?.status).toBe('ACTIVE');
    expect(status.unlock?.remaining_ms).toBe(UNLOCK_WINDOW_HOURS * 3_600_000 - 3_600_000);
    expect(status.amount.gst_rate).toBe('0.1800');
  });

  it('reports an elapsed window as EXPIRED', async () => {
    const { service, prisma, gateway, clock } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');
    const captured = capture(gateway, 'order_1', 11682);
    await service.handleWebhook(captured.body, captured.signature);

    clock.advance((UNLOCK_WINDOW_HOURS + 1) * 3_600_000);
    const status = await service.getStatus(BUYER, prisma.payments[0].id);

    expect(status.unlock?.status).toBe('EXPIRED');
    expect(status.unlock?.remaining_ms).toBe(0);
  });

  it("cannot read another user's payment", async () => {
    const { service, prisma, gateway } = await makeService();
    seed(prisma);
    await service.createUnlockOrder(BUYER, 'profile_target');
    const captured = capture(gateway, 'order_1', 11682);
    await service.handleWebhook(captured.body, captured.signature);

    await expect(service.getStatus(TARGET, prisma.payments[0].id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
