import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ClockService, FrozenClock } from '../common/clock/clock.service';
import { PrismaClient, UserStatus } from '../prisma/prisma-client';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

/** Records the calls that must not happen, so a test can assert on them. */
class RecordingTokenService {
  issued: string[] = [];
  revokedAll: { userId: string; reason: string }[] = [];

  async revokeAllForUser(userId: string, reason: string) {
    this.revokedAll.push({ userId, reason });
    return 1;
  }

  async issueRefreshToken(userId: string) {
    this.issued.push(userId);
    return { token: `refresh-for-${userId}`, familyId: 'fam', expiresAt: new Date() };
  }

  async issueAccessToken(user: { id: string }) {
    return `access-for-${user.id}`;
  }

  accessTtlSeconds() {
    return 900;
  }
}

function harness() {
  const users = [
    {
      id: 'u1',
      status: UserStatus.ACTIVE,
      networthCategory: 'ABOVE_10CR',
      failedLoginCount: 0,
      lockedUntil: null as Date | null,
      deletedAt: null as Date | null,
      isAnonymised: false,
      isPhoneVerified: false,
      mobile: '9876543210',
    },
  ];

  type Row = (typeof users)[number];

  interface Lookup {
    id?: string;
    mobile?: string;
  }

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: Lookup }): Promise<Row | null> =>
        users.find((u) => u.id === where.id || u.mobile === where.mobile) ?? null,
      findUniqueOrThrow: async ({ where }: { where: Lookup }): Promise<Row> => {
        const row = users.find((u) => u.id === where.id || u.mobile === where.mobile);
        if (!row) throw new Error(`no user ${JSON.stringify(where)}`);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Row>;
      }): Promise<Row> => {
        const row = users.find((u) => u.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async (args: {
        where: { id?: string; failedLoginCount?: { lt: number } };
        data: { failedLoginCount?: { increment: number } };
      }): Promise<{ count: number }> => {
        let count = 0;
        for (const row of users) {
          if (args.where.id !== undefined && row.id !== args.where.id) continue;
          const limit = args.where.failedLoginCount?.lt;
          if (limit !== undefined && row.failedLoginCount >= limit) continue;
          row.failedLoginCount += args.data.failedLoginCount?.increment ?? 0;
          count += 1;
        }
        return { count };
      },
    },
  };

  return { users, prisma };
}

/** A stand-in for the OTP store: what was verified, and what was spent. */
class RecordingOtpService {
  verified: { mobile: string; code: string }[] = [];
  consumed: string[] = [];
  nextVerification: string | null = 'otp-row-1';

  async verify(input: { mobile: string; code: string }) {
    this.verified.push({ mobile: input.mobile, code: input.code });
    return this.nextVerification;
  }

  async consumeVerified(input: { mobile: string }) {
    this.consumed.push(input.mobile);
    return true;
  }
}

async function makeService(prisma: unknown, clock: ClockService) {
  const tokens = new RecordingTokenService();
  const otp = new RecordingOtpService();
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: TokenService, useValue: tokens },
      { provide: OtpService, useValue: otp },
      { provide: PrismaClient, useValue: prisma },
      { provide: ClockService, useValue: clock },
    ],
  }).compile();
  return { service: moduleRef.get(AuthService), tokens, otp };
}

describe('AuthService.signIn', () => {
  it('issues a token pair for an active account', async () => {
    const { prisma } = harness();
    const { service } = await makeService(prisma, new ClockService());

    const result = await service.signIn('9876543210');

    expect(result).toEqual({
      access_token: 'access-for-u1',
      refresh_token: 'refresh-for-u1',
      token_type: 'Bearer',
      expires_in: 900,
    });
  });

  it('clears the failure counter on success', async () => {
    const { prisma, users } = harness();
    users[0].failedLoginCount = 3;
    const { service } = await makeService(prisma, new ClockService());

    await service.signIn('9876543210');

    expect(users[0].failedLoginCount).toBe(0);
  });

  it('returns null for an unknown number so the app can route to registration', async () => {
    const { prisma } = harness();
    const { service, tokens } = await makeService(prisma, new ClockService());

    expect(await service.signIn('9000000000')).toBeNull();
    expect(tokens.issued).toHaveLength(0);
  });

  it('refuses a locked account', async () => {
    const { prisma, users } = harness();
    const clock = new FrozenClock(new Date('2026-04-01T00:00:00Z'));
    users[0].lockedUntil = new Date(clock.now().getTime() + 60_000);
    const { service } = await makeService(prisma, clock);

    await expect(service.signIn('9876543210')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows a locked account once the lock has expired', async () => {
    const { prisma, users } = harness();
    const clock = new FrozenClock(new Date('2026-04-01T00:00:00Z'));
    users[0].lockedUntil = new Date(clock.now().getTime() - 1);
    const { service } = await makeService(prisma, clock);

    expect(await service.signIn('9876543210')).not.toBeNull();
  });

  it('refuses a suspended account rather than issuing a useless session', async () => {
    const { prisma, users } = harness();
    users[0].status = UserStatus.SUSPENDED;
    const { service, tokens } = await makeService(prisma, new ClockService());

    await expect(service.signIn('9876543210')).rejects.toThrow(/suspended/i);
    expect(tokens.issued).toHaveLength(0);
  });

  it.each([
    ['soft-deleted', { deletedAt: new Date() }],
    ['anonymised', { isAnonymised: true }],
    ['status DELETED', { status: UserStatus.DELETED }],
  ])('refuses a %s account', async (_label, patch) => {
    const { prisma, users } = harness();
    Object.assign(users[0], patch);
    const { service, tokens } = await makeService(prisma, new ClockService());

    expect(await service.signIn('9876543210')).toBeNull();
    expect(tokens.issued).toHaveLength(0);
  });
});

describe('AuthService.recordFailedSignIn', () => {
  it('increments the failure counter', async () => {
    const { prisma, users } = harness();
    const { service } = await makeService(prisma, new ClockService());

    await service.recordFailedSignIn('u1');
    await service.recordFailedSignIn('u1');

    expect(users[0].failedLoginCount).toBe(2);
    expect(users[0].lockedUntil).toBeNull();
  });

  it('locks the account at the fifth failure', async () => {
    const { prisma, users } = harness();
    const clock = new FrozenClock(new Date('2026-04-01T00:00:00Z'));
    const { service } = await makeService(prisma, clock);

    for (let i = 0; i < 5; i += 1) {
      await service.recordFailedSignIn('u1');
    }

    expect(users[0].failedLoginCount).toBe(5);
    // 15 minutes from server time.
    expect(users[0].lockedUntil?.getTime()).toBe(clock.now().getTime() + 15 * 60_000);
  });

  it('does not keep counting past the threshold', async () => {
    // The counter stops at the limit so a long attack cannot inflate it and
    // leave the lock arithmetic ambiguous.
    const { prisma, users } = harness();
    const { service } = await makeService(
      prisma,
      new FrozenClock(new Date('2026-04-01T00:00:00Z')),
    );

    for (let i = 0; i < 12; i += 1) {
      await service.recordFailedSignIn('u1');
    }

    expect(users[0].failedLoginCount).toBe(5);
  });

  it('locks the account once and does not push the expiry further out', async () => {
    const { prisma, users } = harness();
    const clock = new FrozenClock(new Date('2026-04-01T00:00:00Z'));
    const { service } = await makeService(prisma, clock);

    for (let i = 0; i < 8; i += 1) {
      await service.recordFailedSignIn('u1');
    }

    expect(users[0].lockedUntil?.getTime()).toBe(clock.now().getTime() + 15 * 60_000);
  });
});

describe('AuthService.recordFailedSignInForMobile', () => {
  it('records the failure for the account that owns the number', async () => {
    // The OTP verify step holds a mobile number, not a user id, so this is the
    // path the lockout actually travels in production.
    const { prisma, users } = harness();
    const { service } = await makeService(prisma, new ClockService());

    await service.recordFailedSignInForMobile('9876543210');

    expect(users[0].failedLoginCount).toBe(1);
  });

  it('ignores a number with no account', async () => {
    // Otherwise the lockout becomes an unauthenticated way to block arbitrary
    // numbers from ever registering: no account, no code, one call.
    const { prisma, users } = harness();
    const { service } = await makeService(prisma, new ClockService());

    await service.recordFailedSignInForMobile('9000000000');

    expect(users[0].failedLoginCount).toBe(0);
  });

  it('locks the account after enough failures arrive by number', async () => {
    const { prisma, users } = harness();
    const clock = new FrozenClock(new Date('2026-04-01T00:00:00Z'));
    const { service } = await makeService(prisma, clock);

    for (let i = 0; i < 5; i += 1) {
      await service.recordFailedSignInForMobile('9876543210');
    }

    expect(users[0].lockedUntil?.getTime()).toBe(clock.now().getTime() + 15 * 60_000);
  });
});

/**
 * Changing the number an account signs in with.
 *
 * The number is the identity, so the properties that matter are: the code must be
 * one sent to the NEW number, a number already in use must be refused, a refusal
 * must not spend the code, and every session minted against the old number must
 * end — while the device making the change keeps working.
 */
describe('AuthService.changeMobile', () => {
  it('moves the number, revokes other sessions and re-issues for this device', async () => {
    const { prisma, users } = harness();
    const { service, tokens, otp } = await makeService(prisma, new ClockService());

    const pair = await service.changeMobile('u1', '9123456789', '123456');

    expect(users[0].mobile).toBe('9123456789');
    expect(users[0].isPhoneVerified).toBe(true);
    expect(otp.verified).toEqual([{ mobile: '9123456789', code: '123456' }]);
    expect(otp.consumed).toEqual(['9123456789']);
    expect(tokens.revokedAll).toEqual([{ userId: 'u1', reason: 'MOBILE_CHANGED' }]);
    expect(pair).toEqual({
      access_token: 'access-for-u1',
      refresh_token: 'refresh-for-u1',
      token_type: 'Bearer',
      expires_in: 900,
    });
  });

  it('refuses a code that does not verify, and spends nothing', async () => {
    const { prisma, users } = harness();
    const { service, tokens, otp } = await makeService(prisma, new ClockService());
    otp.nextVerification = null;

    await expect(service.changeMobile('u1', '9123456789', '000000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users[0].mobile).toBe('9876543210');
    expect(otp.consumed).toEqual([]);
    expect(tokens.revokedAll).toEqual([]);
  });

  it('refuses a number another account already uses', async () => {
    const { prisma, users } = harness();
    const { service, tokens, otp } = await makeService(prisma, new ClockService());
    users.push({ ...users[0], id: 'u2', mobile: '9123456789', failedLoginCount: 0 });

    await expect(service.changeMobile('u1', '9123456789', '123456')).rejects.toThrow(
      /already registered/,
    );
    expect(otp.consumed).toEqual([]);
    expect(tokens.revokedAll).toEqual([]);
  });

  it('refuses the number the account already has', async () => {
    const { prisma } = harness();
    const { service, otp } = await makeService(prisma, new ClockService());

    await expect(service.changeMobile('u1', '9876543210', '123456')).rejects.toThrow(
      /already your mobile/,
    );
    expect(otp.verified).toEqual([]);
  });

  it('refuses a deleted account', async () => {
    const { prisma, users } = harness();
    const { service } = await makeService(prisma, new ClockService());
    users[0].deletedAt = new Date();

    await expect(service.changeMobile('u1', '9123456789', '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
