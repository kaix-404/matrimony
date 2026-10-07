import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AccountDeletionResultSchema } from '@matrimony/shared';
import { AccountDeletionService } from './account-deletion.service';

/**
 * Account deletion tests — section 21.
 *
 * The read side that makes a deletion effective is covered where it lives:
 * discovery proves a deleted owner leaves the feed, refresh proves a session
 * dies, unlock proves contact is withheld, and block/report prove 404. What is
 * untested until now is the write, and the two things that make it safe rather
 * than merely effective: that it refuses to proceed without a spent
 * re-authentication, and that it leaves payment records alone.
 *
 * The fake evaluates the `where` clauses it is sent rather than applying a
 * fixed policy, so a dropped `revokedAt: null` would surface as already-used
 * sessions being revoked twice instead of as a test that quietly passes.
 */

const USER = 'user_one';
const MOBILE = '9876543210';
const PROFILE = 'profile_one';

interface UserRow {
  id: string;
  mobile: string;
  deletedAt: Date | null;
  deletionRequestedAt: Date | null;
  purgeAfter: Date | null;
  status: string;
  lockedUntil: Date | null;
  failedLoginCount: number;
}

interface ProfileRow {
  id: string;
  userId: string;
  deletedAt: Date | null;
}

interface TokenRow {
  id: string;
  userId: string;
  revokedAt: Date | null;
  revokedReason: string | null;
}

/** Every write the service performs, so a call to a model it must not touch fails the test. */
interface PrismaCall {
  model: string;
  op: string;
}

function user(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: USER,
    mobile: MOBILE,
    deletedAt: null,
    deletionRequestedAt: null,
    purgeAfter: null,
    status: 'ACTIVE',
    lockedUntil: new Date('2026-10-01T00:00:00.000Z'),
    failedLoginCount: 4,
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return { id: PROFILE, userId: USER, deletedAt: null, ...overrides };
}

function token(id: string, overrides: Partial<TokenRow> = {}): TokenRow {
  return { id, userId: USER, revokedAt: null, revokedReason: null, ...overrides };
}

interface ServiceFixture {
  service: AccountDeletionService;
  users: UserRow[];
  profiles: ProfileRow[];
  tokens: TokenRow[];
  calls: PrismaCall[];
  consumeArgs: { mobile: string; purpose: string }[];
}

function makeService(
  opts: {
    users?: UserRow[];
    profiles?: ProfileRow[];
    tokens?: TokenRow[];
    /** What the OTP layer reports; `true` models a spent re-authentication. */
    otpConsumed?: boolean;
    retentionMonths?: number;
    now?: Date;
  } = {},
): ServiceFixture {
  const users = opts.users ?? [user()];
  const profiles = opts.profiles ?? [profile()];
  const tokens = opts.tokens ?? [token('tok_live'), token('tok_used', { revokedAt: new Date() })];
  const calls: PrismaCall[] = [];
  const consumeArgs: { mobile: string; purpose: string }[] = [];
  const now = opts.now ?? new Date('2026-10-06T12:00:00.000Z');

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = users.find((u) => u.id === where.id);
        if (!row) return null;
        return {
          id: row.id,
          mobile: row.mobile,
          deletedAt: row.deletedAt,
          purgeAfter: row.purgeAfter,
        };
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
      updateMany: async ({ where, data }: { where: { userId: string }; data: Partial<ProfileRow> }) => {
        calls.push({ model: 'profile', op: 'updateMany' });
        let count = 0;
        for (const row of profiles) {
          if (row.userId !== where.userId) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    refreshToken: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; revokedAt?: Date | null };
        data: { revokedAt: Date; revokedReason: string };
      }) => {
        calls.push({ model: 'refreshToken', op: 'updateMany' });
        let count = 0;
        for (const row of tokens) {
          if (row.userId !== where.userId) continue;
          // `revokedAt: null` means "still live". A fake that ignored it would
          // silently revoke already-revoked rows and the distinction would never
          // show up in an assertion.
          if (where.revokedAt === null && row.revokedAt !== null) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => {
      const results: unknown[] = [];
      for (const op of ops) results.push(await op);
      return results;
    },
  };

  const otp = {
    consumeVerified: async (input: { mobile: string; purpose: string }) => {
      consumeArgs.push(input);
      return opts.otpConsumed ?? true;
    },
  };

  const clock = { now: () => now };
  const env = { DELETED_ACCOUNT_RETENTION_MONTHS: opts.retentionMonths ?? 6 };

  return {
    service: new AccountDeletionService(
      prisma as never,
      otp as never,
      clock as never,
      env as never,
    ),
    users,
    profiles,
    tokens,
    calls,
    consumeArgs,
  };
}

describe('AccountDeletionService.deleteAccount', () => {
  it('soft-deletes the account, the profile, and every live session', async () => {
    const { service, users, profiles, tokens } = makeService();

    const result = await service.deleteAccount(USER);

    AccountDeletionResultSchema.parse(result);
    expect(result.deleted).toBe(true);

    const owner = users[0];
    expect(owner.deletedAt).toEqual(new Date('2026-10-06T12:00:00.000Z'));
    expect(owner.deletionRequestedAt).toEqual(new Date('2026-10-06T12:00:00.000Z'));
    expect(owner.status).toBe('DELETED');
    // The lockout is meaningless once the account cannot sign in at all.
    expect(owner.lockedUntil).toBeNull();
    expect(owner.failedLoginCount).toBe(0);

    // Both rows, because `isLiveProfile` asks about the profile first and the
    // blocked list filters on `profile.deletedAt`. Updating only the owner
    // would leave block and report disagreeing with discovery.
    expect(profiles[0].deletedAt).toEqual(new Date('2026-10-06T12:00:00.000Z'));

    expect(tokens.find((t) => t.id === 'tok_live')?.revokedReason).toBe('ACCOUNT_DELETED');
    expect(tokens.find((t) => t.id === 'tok_live')?.revokedAt).toEqual(
      new Date('2026-10-06T12:00:00.000Z'),
    );
    // Already-revoked rows are left alone; re-revoking would rewrite the reason
    // and destroy the record of why the session died.
    expect(tokens.find((t) => t.id === 'tok_used')?.revokedReason).toBeNull();
  });

  it('sets the retention deadline from the configured retention window', async () => {
    const { service, users } = makeService({ retentionMonths: 6 });

    const result = await service.deleteAccount(USER);

    expect(users[0].purgeAfter).toEqual(new Date('2027-04-06T12:00:00.000Z'));
    expect(result.purge_after).toBe('2027-04-06T12:00:00.000Z');
  });

  it('clamps the retention deadline to the last day of a shorter month', async () => {
    const { service, users } = makeService({
      retentionMonths: 1,
      now: new Date('2026-01-31T12:00:00.000Z'),
    });

    const result = await service.deleteAccount(USER);

    // 31 Jan + 1 month is 28 Feb, not 3 Mar. A retention period that quietly
    // lengthens is one the client answer F6 does not describe.
    expect(users[0].purgeAfter).toEqual(new Date('2026-02-28T12:00:00.000Z'));
    expect(result.purge_after).toBe('2026-02-28T12:00:00.000Z');
  });

  it('touches no model other than user, profile and refresh token', async () => {
    const { service, calls } = makeService();

    await service.deleteAccount(USER);

    // Section 21: payment records are kept. Asserting the exact set of models
    // written is stronger than asserting any one is absent, because a new write
    // added later shows up here even if nobody thought to add an assertion.
    expect([...new Set(calls.map((c) => c.model))].sort()).toEqual([
      'profile',
      'refreshToken',
      'user',
    ]);
  });

  it('binds the re-authentication to the account by mobile and purpose', async () => {
    const { service, consumeArgs } = makeService();

    await service.deleteAccount(USER);

    // The mobile comes from the caller's own row, never from the request, so a
    // code issued for some other number cannot be redeemed here.
    expect(consumeArgs).toEqual([{ mobile: MOBILE, purpose: 'DELETE_ACCOUNT' }]);
  });

  it('refuses without a verified code and changes nothing', async () => {
    const { service, users, profiles, tokens, calls } = makeService({ otpConsumed: false });

    await expect(service.deleteAccount(USER)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(calls).toHaveLength(0);
    expect(users[0].deletedAt).toBeNull();
    expect(profiles[0].deletedAt).toBeNull();
    expect(tokens.every((t) => t.revokedReason !== 'ACCOUNT_DELETED')).toBe(true);
  });

  it('answers 404 for an account that does not exist', async () => {
    const { service, calls } = makeService({ users: [] });

    await expect(service.deleteAccount('nobody')).rejects.toBeInstanceOf(NotFoundException);
    expect(calls).toHaveLength(0);
  });

  it('reports the same deadline on a retry that arrives after the code was spent', async () => {
    const first = makeService();
    const initial = await first.service.deleteAccount(USER);

    // The code is gone by now, so a second request must not need one — which is
    // why the deleted check runs before the OTP claim rather than after.
    const retry = makeService({
      users: [first.users[0]],
      profiles: first.profiles,
      tokens: first.tokens,
      otpConsumed: false,
    });
    const again = await retry.service.deleteAccount(USER);

    AccountDeletionResultSchema.parse(again);
    expect(again).toEqual(initial);
    expect(retry.calls).toHaveLength(0);
  });
});
