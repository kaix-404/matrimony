import { Test } from '@nestjs/testing';
import { ClockService, FrozenClock } from '../common/clock/clock.service';
import { PrismaClient, UserStatus } from '../prisma/prisma-client';
import { RegistrationService } from './registration.service';

/**
 * The category assignment is the golden rule in section 36, so it is tested
 * against the three ways it could be violated: an unknown band, a band that is
 * not active, and a client trying to change an existing user's band.
 */
interface FakeUser {
  id: string;
  mobile: string;
  networthCategory: string;
  status: string;
  isPhoneVerified: boolean;
  identityVerifiedAt: Date | null;
  setupFeePaidAt: Date | null;
  deletedAt: Date | null;
  lastLoginAt: Date | null;
  profile: { status: string } | null;
}

const categoryRows = [
  { key: 'BELOW_2CR', isActive: true, isDiscoverable: true },
  { key: 'TWO_CR_TO_FIVE_CR', isActive: true, isDiscoverable: true },
  { key: 'ABOVE_10CR', isActive: true, isDiscoverable: true },
  { key: 'RETIRED_BAND', isActive: false, isDiscoverable: false },
];

function harness() {
  const users: FakeUser[] = [];
  let nextId = 1;

  type UserLookup = { id?: string; mobile?: string };

  const prisma = {
    netWorthCategoryRef: {
      findFirst: async ({ where }: { where: { key: string; isActive: boolean } }) =>
        categoryRows.find((r) => r.key === where.key && r.isActive === where.isActive) ?? null,
    },
    user: {
      findUnique: async ({ where }: { where: UserLookup }) =>
        users.find((u) => u.id === where.id || u.mobile === where.mobile) ?? null,
      create: async ({
        data,
      }: {
        data: Partial<FakeUser> & { mobile: string; networthCategory: string };
      }) => {
        const row: FakeUser = {
          id: `u${nextId++}`,
          mobile: data.mobile,
          networthCategory: data.networthCategory,
          status: data.status,
          isPhoneVerified: data.isPhoneVerified,
          identityVerifiedAt: null,
          setupFeePaidAt: null,
          deletedAt: null,
          lastLoginAt: data.lastLoginAt ?? null,
          profile: null,
        };
        users.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const row = users.find((u) => u.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  };

  return { users, prisma };
}

async function makeService(prisma: unknown, clock: ClockService) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RegistrationService,
      { provide: PrismaClient, useValue: prisma },
      { provide: ClockService, useValue: clock },
    ],
  }).compile();
  return moduleRef.get(RegistrationService);
}

describe('RegistrationService.complete', () => {
  it('creates the account in PENDING_VERIFICATION', async () => {
    // Registration proves the phone and picks a band; D9 still requires the
    // identity check, so ACTIVE here would skip a mandatory gate.
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());

    const result = await service.complete({
      mobile: '9876543210',
      networth_category: 'ABOVE_10CR',
    });

    expect(result.created).toBe(true);
    expect(users[0]).toMatchObject({
      mobile: '9876543210',
      networthCategory: 'ABOVE_10CR',
      status: UserStatus.PENDING_VERIFICATION,
      isPhoneVerified: true,
    });
  });

  it('marks the account discoverable only after verification and payment', async () => {
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());
    await service.complete({ mobile: '9876543210', networth_category: 'ABOVE_10CR' });

    expect(await service.currentUser(users[0].id)).toMatchObject({
      can_discover: false,
      identity_verified: false,
      setup_fee_paid: false,
    });
  });

  it('rejects an unknown band', async () => {
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());

    await expect(
      service.complete({ mobile: '9876543210', networth_category: 'BILLIONAIRE' }),
    ).rejects.toThrow(/Unknown net-worth category/);
    expect(users).toHaveLength(0);
  });

  it('rejects a band that has been deactivated', async () => {
    // An admin retiring a band must not leave it registrable.
    const { prisma } = harness();
    const service = await makeService(prisma, new ClockService());

    await expect(
      service.complete({ mobile: '9876543210', networth_category: 'RETIRED_BAND' }),
    ).rejects.toThrow();
  });

  it('is idempotent for a repeated registration on the same number', async () => {
    // A client that timed out mid-request must not show the user an error for
    // an account that already exists.
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());

    const first = await service.complete({ mobile: '9876543210', networth_category: 'ABOVE_10CR' });
    const second = await service.complete({
      mobile: '9876543210',
      networth_category: 'ABOVE_10CR',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);
    expect(users).toHaveLength(1);
  });

  it('does not let a retry change the category of an existing account', async () => {
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());

    await service.complete({ mobile: '9876543210', networth_category: 'BELOW_2CR' });
    await service.complete({ mobile: '9876543210', networth_category: 'ABOVE_10CR' });

    expect(users[0].networthCategory).toBe('BELOW_2CR');
  });
});

describe('RegistrationService.currentUser', () => {
  it('reports can_discover only once verified, paid and active', async () => {
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());
    await service.complete({ mobile: '9876543210', networth_category: 'ABOVE_10CR' });
    const id = users[0].id;

    expect((await service.currentUser(id)).can_discover).toBe(false);

    await prisma.user.update({ where: { id }, data: { identityVerifiedAt: new Date() } });
    expect((await service.currentUser(id)).can_discover).toBe(false);

    await prisma.user.update({ where: { id }, data: { setupFeePaidAt: new Date() } });
    expect((await service.currentUser(id)).can_discover).toBe(false);

    await prisma.user.update({ where: { id }, data: { status: UserStatus.ACTIVE } });
    expect((await service.currentUser(id)).can_discover).toBe(true);
  });

  it('is false for a suspended account even when verified and paid', async () => {
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());
    await service.complete({ mobile: '9876543210', networth_category: 'ABOVE_10CR' });
    const id = users[0].id;

    await prisma.user.update({
      where: { id },
      data: {
        identityVerifiedAt: new Date(),
        setupFeePaidAt: new Date(),
        status: UserStatus.SUSPENDED,
      },
    });

    expect((await service.currentUser(id)).can_discover).toBe(false);
  });

  it('is false for a soft-deleted account', async () => {
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());
    await service.complete({ mobile: '9876543210', networth_category: 'ABOVE_10CR' });
    const id = users[0].id;

    await prisma.user.update({
      where: { id },
      data: {
        identityVerifiedAt: new Date(),
        setupFeePaidAt: new Date(),
        status: UserStatus.ACTIVE,
        deletedAt: new Date(),
      },
    });

    expect((await service.currentUser(id)).can_discover).toBe(false);
  });

  it('treats a draft profile as incomplete', async () => {
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());
    await service.complete({ mobile: '9876543210', networth_category: 'ABOVE_10CR' });
    const id = users[0].id;

    expect((await service.currentUser(id)).profile_complete).toBe(false);

    users[0].profile = { status: 'DRAFT' };
    expect((await service.currentUser(id)).profile_complete).toBe(false);

    users[0].profile = { status: 'PENDING_REVIEW' };
    expect((await service.currentUser(id)).profile_complete).toBe(true);
  });

  it('carries no profile field into the payload', async () => {
    const { prisma, users } = harness();
    const service = await makeService(prisma, new ClockService());
    await service.complete({ mobile: '9876543210', networth_category: 'ABOVE_10CR' });

    const payload = await service.currentUser(users[0].id);

    expect(Object.keys(payload).sort()).toEqual([
      'can_discover',
      'id',
      'identity_verified',
      'is_phone_verified',
      'mobile',
      'networth_category',
      'profile_complete',
      'setup_fee_paid',
      'status',
    ]);
  });

  it('throws for an unknown user id', async () => {
    const { prisma } = harness();
    const service = await makeService(prisma, new ClockService());
    await expect(service.currentUser('nope')).rejects.toThrow(/User not found/);
  });

  it('records lastLoginAt from the injected clock, not wall time', async () => {
    // Server time is what makes expiry rules reproducible in tests and immune to
    // a client with a skewed clock.
    const { prisma, users } = harness();
    const at = new Date('2026-05-05T08:00:00Z');
    const service = await makeService(prisma, new FrozenClock(at));

    await service.complete({ mobile: '9876543210', networth_category: 'ABOVE_10CR' });

    expect(users[0].lastLoginAt?.toISOString()).toBe(at.toISOString());
  });
});
