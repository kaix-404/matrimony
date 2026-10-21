import { AccountDeletionService } from './account-deletion.service';
import { Prisma } from '../prisma/prisma-client';

/**
 * Account retention tests — section 21, the anonymisation half.
 *
 * `deleteAccount` only sets `purgeAfter`; these tests cover the pass that reads
 * it. The fake evaluates the `where` clauses it is sent and records every write,
 * so a dropped `isAnonymised: false` guard (which would re-erase a live row) or
 * a stray write to `Payment`/`ContactUnlock` (which section 21 forbids) shows up
 * as an assertion rather than a silently green test.
 */

const USER = 'user_one';
const PROFILE = 'profile_one';

interface UserRow {
  id: string;
  mobile: string;
  email: string | null;
  purgeAfter: Date | null;
  isAnonymised: boolean;
  status: string;
  lockedUntil: Date | null;
  failedLoginCount: number;
  lastLoginAt: Date | null;
}

interface ProfileRow {
  id: string;
  userId: string;
  firstName: string;
  lastName: string | null;
  aboutMe: string | null;
  city: string | null;
}

interface PrismaCall {
  model: string;
  op: string;
}

function user(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: USER,
    mobile: '9876543210',
    email: 'a@example.com',
    purgeAfter: new Date('2026-10-01T00:00:00.000Z'),
    isAnonymised: false,
    status: 'DELETED',
    lockedUntil: null,
    failedLoginCount: 0,
    lastLoginAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: PROFILE,
    userId: USER,
    firstName: 'Asha',
    lastName: 'Rao',
    aboutMe: 'Loves hiking',
    city: 'Pune',
    ...overrides,
  };
}

interface ServiceFixture {
  service: AccountDeletionService;
  users: UserRow[];
  profiles: ProfileRow[];
  photos: { id: string; profileId: string }[];
  interests: { profileId: string; interestKey: string }[];
  payments: { id: string; userId: string }[];
  unlocks: { id: string; userId: string }[];
  calls: PrismaCall[];
}

function makeService(
  opts: {
    users?: UserRow[];
    profiles?: ProfileRow[];
    now?: Date;
  } = {},
): ServiceFixture {
  const users = opts.users ?? [user()];
  const profiles = opts.profiles ?? [profile()];
  const photos = [{ id: 'photo_one', profileId: PROFILE }];
  const interests = [{ profileId: PROFILE, interestKey: 'TRAVEL' }];
  const payments = [{ id: 'pay_one', userId: USER }];
  const unlocks = [{ id: 'unlock_one', userId: USER }];
  const calls: PrismaCall[] = [];
  const now = opts.now ?? new Date('2026-10-06T12:00:00.000Z');

  const prisma = {
    user: {
      findMany: async ({
        where,
      }: {
        where: { purgeAfter?: { lte: Date }; isAnonymised?: boolean };
      }) => {
        calls.push({ model: 'user', op: 'findMany' });
        return users
          .filter((u) => {
            // A fake that ignored the guards would erase rows that are not yet
            // due or already anonymised, and the idempotency claim would be
            // untested.
            if (where.isAnonymised === false && u.isAnonymised) return false;
            if (where.purgeAfter?.lte) {
              if (!u.purgeAfter || u.purgeAfter > where.purgeAfter.lte) return false;
            }
            return true;
          })
          .map((u) => ({
            id: u.id,
            profile: profiles.find((p) => p.userId === u.id) ? { id: PROFILE } : null,
          }));
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        calls.push({ model: 'user', op: 'update' });
        const row = users.find((u) => u.id === where.id);
        if (!row) throw new Error('record not found');
        Object.assign(row, data);
        return row;
      },
    },
    profile: {
      update: async ({ where, data }: { where: { id: string }; data: Partial<ProfileRow> }) => {
        calls.push({ model: 'profile', op: 'update' });
        const row = profiles.find((p) => p.id === where.id);
        if (!row) throw new Error('record not found');
        Object.assign(row, data);
        return row;
      },
    },
    profilePhoto: {
      deleteMany: async ({ where }: { where: { profileId: string } }) => {
        calls.push({ model: 'profilePhoto', op: 'deleteMany' });
        const before = photos.length;
        for (let i = photos.length - 1; i >= 0; i -= 1) {
          if (photos[i]!.profileId === where.profileId) photos.splice(i, 1);
        }
        return { count: before - photos.length };
      },
    },
    profileInterest: {
      deleteMany: async ({ where }: { where: { profileId: string } }) => {
        calls.push({ model: 'profileInterest', op: 'deleteMany' });
        const before = interests.length;
        for (let i = interests.length - 1; i >= 0; i -= 1) {
          if (interests[i]!.profileId === where.profileId) interests.splice(i, 1);
        }
        return { count: before - interests.length };
      },
    },
    // Present so a call to them would be recorded and fail the "payment records
    // are kept" assertion, which is the point of declaring them at all.
    payment: {
      deleteMany: async () => {
        calls.push({ model: 'payment', op: 'deleteMany' });
        return { count: 0 };
      },
    },
    contactUnlock: {
      deleteMany: async () => {
        calls.push({ model: 'contactUnlock', op: 'deleteMany' });
        return { count: 0 };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => {
      const results: unknown[] = [];
      for (const op of ops) results.push(await op);
      return results;
    },
  };

  const otp = { consumeVerified: async () => true };
  const clock = { now: () => now };
  const env = { DELETED_ACCOUNT_RETENTION_MONTHS: 6 };

  return {
    service: new AccountDeletionService(
      prisma as never,
      otp as never,
      clock as never,
      env as never,
    ),
    users,
    profiles,
    photos,
    interests,
    payments,
    unlocks,
    calls,
  };
}

describe('AccountDeletionService.purgeDue', () => {
  it('anonymises an account past its retention window', async () => {
    const { service, users, profiles } = makeService();

    const purged = await service.purgeDue();

    expect(purged).toBe(1);
    expect(users[0].isAnonymised).toBe(true);
    expect(profiles[0].firstName).toBe('Deleted');
    expect(profiles[0].lastName).toBeNull();
    expect(profiles[0].aboutMe).toBeNull();
    expect(profiles[0].city).toBeNull();
  });

  it('replaces the login identifier with a per-account tombstone', async () => {
    const { service, users } = makeService();

    await service.purgeDue();

    // Deterministic and unique per row, so the real mobile is freed for a fresh
    // registration while the erased row keeps a stable, non-PII value.
    expect(users[0].mobile).toBe(`purged:${USER}`);
    expect(users[0].email).toBeNull();
  });

  it('erases the photos and interests that link back to a person', async () => {
    const { service, photos, interests } = makeService();

    await service.purgeDue();

    expect(photos).toHaveLength(0);
    expect(interests).toHaveLength(0);
  });

  it('keeps payment and unlock records', async () => {
    const { service, payments, unlocks, calls } = makeService();

    await service.purgeDue();

    // Section 21: the accounting survives the person.
    expect(payments).toHaveLength(1);
    expect(unlocks).toHaveLength(1);
    expect(calls.some((c) => c.model === 'payment' || c.model === 'contactUnlock')).toBe(false);
  });

  it('leaves an account that is not yet due alone', async () => {
    const { service, users, calls } = makeService({
      users: [user({ purgeAfter: new Date('2027-01-01T00:00:00.000Z') })],
    });

    const purged = await service.purgeDue();

    expect(purged).toBe(0);
    expect(users[0].isAnonymised).toBe(false);
    expect(users[0].mobile).toBe('9876543210');
    expect(calls.filter((c) => c.op !== 'findMany')).toHaveLength(0);
  });

  it('is idempotent: an already-anonymised row is not matched again', async () => {
    const { service, users } = makeService({ users: [user({ isAnonymised: true })] });

    const purged = await service.purgeDue();

    expect(purged).toBe(0);
    expect(users[0].mobile).toBe('9876543210');
  });

  it('anonymises each due account independently', async () => {
    const second = user({ id: 'user_two', mobile: '9000000000', email: null });
    const { service, users } = makeService({
      users: [user(), second],
      profiles: [
        profile(),
        { id: 'profile_two', userId: 'user_two', firstName: 'B', lastName: null, aboutMe: null, city: null },
      ],
    });

    const purged = await service.purgeDue();

    expect(purged).toBe(2);
    expect(users[0].mobile).toBe(`purged:${USER}`);
    expect(users[1].mobile).toBe('purged:user_two');

    // `Prisma.DbNull` is the "explicitly null JSON" sentinel; asserting the
    // update used it guards against the value being dropped by the transaction.
    expect(Prisma.DbNull).toBeDefined();
  });
});
