import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ClockService, FrozenClock } from '../common/clock/clock.service';
import { PrismaClient } from '../prisma/prisma-client';
import { TokenService, parseDurationSeconds } from './token.service';
import type { Env } from '../config/env';

/**
 * Rotation is the security-relevant behaviour in Phase 1, so it is tested
 * against a fake store rather than mocked away.
 *
 * A real Postgres is used elsewhere for this; here the in-memory double
 * implements just enough of `refreshToken` to assert the invariants — that a
 * rotated token cannot be used twice, and that reuse revokes the family.
 */
interface StoredToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  revokedAt: Date | null;
  revokedReason: string | null;
  expiresAt: Date;
}

class FakeRefreshStore {
  rows = new Map<string, StoredToken>();
  private nextId = 1;

  /** Mirrors Prisma's `{ data: {...} }` argument shape. */
  create = async ({
    data,
  }: {
    data: Omit<StoredToken, 'id' | 'revokedAt' | 'revokedReason'>;
  }): Promise<StoredToken> => {
    const row: StoredToken = {
      ...data,
      id: `t${this.nextId++}`,
      revokedAt: null,
      revokedReason: null,
    };
    this.rows.set(data.tokenHash, row);
    return row;
  };

  findUnique = async (args: {
    where: { tokenHash: string };
  }): Promise<(StoredToken & { user: FakeUser }) | null> => {
    const row = this.rows.get(args.where.tokenHash);
    return row ? { ...row, user: users.get(row.userId)! } : null;
  };

  updateMany = async (args: {
    where: { id?: string; familyId?: string; tokenHash?: string; revokedAt?: null };
    data: { revokedAt?: Date; revokedReason?: string };
  }): Promise<{ count: number }> => {
    let count = 0;
    for (const row of this.rows.values()) {
      // `revokedAt: null` in a Prisma where-clause means "still live", so the
      // predicate has to be compared as a boolean. Comparing `row.revokedAt ===
      // null` to a literal `null` directly is always false and would silently
      // match nothing.
      const matches =
        (args.where.id === undefined || row.id === args.where.id) &&
        (args.where.familyId === undefined || row.familyId === args.where.familyId) &&
        (args.where.tokenHash === undefined || row.tokenHash === args.where.tokenHash) &&
        (args.where.revokedAt === undefined ||
          (args.where.revokedAt === null) === (row.revokedAt === null));
      if (matches) {
        row.revokedAt = args.data.revokedAt ?? row.revokedAt;
        row.revokedReason = args.data.revokedReason ?? row.revokedReason;
        count += 1;
      }
    }
    return { count };
  };

  update = async (args: {
    where: { id: string };
    data: { revokedAt?: Date; revokedReason?: string };
  }) => {
    for (const row of this.rows.values()) {
      if (row.id === args.where.id) {
        row.revokedAt = args.data.revokedAt ?? row.revokedAt;
        row.revokedReason = args.data.revokedReason ?? row.revokedReason;
        return row;
      }
    }
    throw new Error('not found');
  };
}

interface FakeUser {
  id: string;
  status: string;
  networthCategory: string;
  deletedAt: Date | null;
  isAnonymised: boolean;
}

const users = new Map<string, FakeUser>();

const env = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
} as Env;

async function makeService(clock: ClockService) {
  const store = new FakeRefreshStore();

  const moduleRef = await Test.createTestingModule({
    imports: [
      // Configured the same way AuthModule does it, rather than patching the
      // resolved service's internals afterwards — a test that reaches into a
      // private field is not asserting the shipped configuration.
      JwtModule.register({ secret: env.JWT_ACCESS_SECRET, signOptions: { expiresIn: 900 } }),
    ],
    providers: [
      TokenService,
      { provide: 'ENV', useValue: env },
      { provide: ClockService, useValue: clock },
      { provide: PrismaClient, useValue: { refreshToken: store } },
    ],
  }).compile();

  return { service: moduleRef.get(TokenService), store };
}

beforeEach(() => {
  users.clear();
  users.set('u1', {
    id: 'u1',
    status: 'ACTIVE',
    networthCategory: 'ABOVE_10CR',
    deletedAt: null,
    isAnonymised: false,
  });
});

describe('parseDurationSeconds', () => {
  it.each([
    ['15m', 900],
    ['30d', 2_592_000],
    ['900s', 900],
    ['2h', 7200],
  ])('parses %s', (input, expected) => {
    expect(parseDurationSeconds(input)).toBe(expected);
  });

  it.each(['', '15', 'm', '15x', '-5m', '1.5h'])('rejects %p', (input) => {
    expect(() => parseDurationSeconds(input)).toThrow(/Unsupported duration/);
  });
});

describe('access tokens', () => {
  it('carries the identity, status and category partition key', async () => {
    const { service } = await makeService(new ClockService());
    const token = await service.issueAccessToken({
      id: 'u1',
      status: 'ACTIVE',
      networthCategory: 'TWO_CR_TO_FIVE_CR',
    });
    const claims = await service.verifyAccessToken(token);

    expect(claims).toMatchObject({
      sub: 'u1',
      typ: 'access',
      status: 'ACTIVE',
      cat: 'TWO_CR_TO_FIVE_CR',
    });
    expect(claims?.exp).toBeGreaterThan(claims!.iat);
  });

  it('expires in 15 minutes by default', async () => {
    const { service } = await makeService(new ClockService());
    const token = await service.issueAccessToken({
      id: 'u1',
      status: 'ACTIVE',
      networthCategory: 'ABOVE_10CR',
    });
    const claims = await service.verifyAccessToken(token);

    expect(claims!.exp - claims!.iat).toBe(900);
  });

  it('rejects a token signed with another key', async () => {
    const { service } = await makeService(new ClockService());
    const other = new JwtService({ secret: 'a-different-secret' });
    const forged = await other.signAsync({
      sub: 'u1',
      typ: 'access',
      status: 'ACTIVE',
      cat: 'ABOVE_10CR',
    });

    expect(await service.verifyAccessToken(forged)).toBeNull();
  });

  it.each(['not-a-jwt', '', 'a.b.c'])('rejects malformed token %p', async (candidate) => {
    const { service } = await makeService(new ClockService());
    expect(await service.verifyAccessToken(candidate)).toBeNull();
  });

  it('refuses a token that is not typed as access', async () => {
    // Guards against a refresh-shaped payload being replayed as an access token.
    const { service } = await makeService(new ClockService());
    const jwt = new JwtService({ secret: env.JWT_ACCESS_SECRET });
    const wrongType = await jwt.signAsync({ sub: 'u1', typ: 'refresh' });

    expect(await service.verifyAccessToken(wrongType)).toBeNull();
  });
});

describe('refresh token rotation', () => {
  it('issues a refresh token that can be rotated exactly once', async () => {
    const clock = new FrozenClock(new Date('2026-01-01T00:00:00Z'));
    const { service } = await makeService(clock);

    const first = await service.issueRefreshToken('u1');
    expect(first.token).toMatch(/^[A-Za-z0-9_-]+$/);

    const rotated = await service.rotate(first.token);
    expect(rotated).not.toBeNull();
    expect(rotated!.refreshToken).not.toBe(first.token);
    expect(rotated!.expiresIn).toBe(900);
  });

  it('refuses a second use of the same token and revokes the family', async () => {
    const clock = new FrozenClock(new Date('2026-01-01T00:00:00Z'));
    const { service, store } = await makeService(clock);

    const first = await service.issueRefreshToken('u1');
    await service.rotate(first.token);

    // The attacker replays the token that was already rotated.
    expect(await service.rotate(first.token)).toBeNull();

    // Every token in that family is now dead, including the legitimate successor.
    const rows = [...store.rows.values()];
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    expect(rows.some((r) => r.revokedReason === 'REUSE_DETECTED')).toBe(true);
  });

  it('keeps the successor dead after reuse detection', async () => {
    const clock = new FrozenClock(new Date('2026-01-01T00:00:00Z'));
    const { service } = await makeService(clock);

    const first = await service.issueRefreshToken('u1');
    const rotated = await service.rotate(first.token);
    await service.rotate(first.token); // replay

    expect(await service.rotate(rotated!.refreshToken)).toBeNull();
  });

  it('keeps unrelated families alive', async () => {
    const clock = new FrozenClock(new Date('2026-01-01T00:00:00Z'));
    const { service } = await makeService(clock);

    const phone = await service.issueRefreshToken('u1');
    const laptop = await service.issueRefreshToken('u1');

    await service.rotate(phone.token);
    await service.rotate(phone.token); // replay on the phone family

    // Signing out or being attacked on one device must not end the other.
    expect(await service.rotate(laptop.token)).not.toBeNull();
  });

  it('rejects an unknown token without revealing anything', async () => {
    const { service } = await makeService(new ClockService());
    expect(await service.rotate('never-issued')).toBeNull();
  });

  it('rejects a token at the exact millisecond it expires, but not one before', async () => {
    // The boundary is the whole point: a token must work right up to its
    // expiry and fail at it. An off-by-one here either logs users out early or
    // leaves a token live past its stated lifetime.
    const clock = new FrozenClock(new Date('2026-01-01T00:00:00Z'));
    const { service } = await makeService(clock);

    const live = await service.issueRefreshToken('u1');

    // One millisecond before expiry: still valid.
    clock.set(new Date(live.expiresAt.getTime() - 1));
    expect(await service.rotate(live.token)).not.toBeNull();

    // A fresh token so the rotation above is not what is under test.
    const boundary = await service.issueRefreshToken('u1');
    clock.set(new Date(boundary.expiresAt.getTime()));
    expect(await service.rotate(boundary.token)).toBeNull();
  });

  it('records an expired token as revoked rather than leaving it live', async () => {
    const clock = new FrozenClock(new Date('2026-01-01T00:00:00Z'));
    const { service, store } = await makeService(clock);

    const issued = await service.issueRefreshToken('u1');
    clock.advance(31 * 86_400_000);
    expect(await service.rotate(issued.token)).toBeNull();

    const row = [...store.rows.values()].find((r) => r.tokenHash.length > 0);
    expect(row?.revokedReason).toBe('EXPIRED');
  });

  it('refuses tokens for a deleted account', async () => {
    const clock = new FrozenClock(new Date('2026-01-01T00:00:00Z'));
    const { service } = await makeService(clock);

    const issued = await service.issueRefreshToken('u1');
    users.set('u1', { ...users.get('u1')!, deletedAt: new Date() });

    expect(await service.rotate(issued.token)).toBeNull();
  });

  it('refuses tokens for an anonymised account', async () => {
    const clock = new FrozenClock(new Date('2026-01-01T00:00:00Z'));
    const { service } = await makeService(clock);

    const issued = await service.issueRefreshToken('u1');
    users.set('u1', { ...users.get('u1')!, isAnonymised: true });

    expect(await service.rotate(issued.token)).toBeNull();
  });
});

describe('logout', () => {
  it('revokes only the presented token', async () => {
    const { service, store } = await makeService(new ClockService());

    const phone = await service.issueRefreshToken('u1');
    const laptop = await service.issueRefreshToken('u1');

    expect(await service.revoke(phone.token)).toBe(true);

    // Only the phone's session ends. Revoking the family here would sign the
    // user out on every device, which is not what "log out" means.
    expect(await service.rotate(phone.token)).toBeNull();
    expect(await service.rotate(laptop.token)).not.toBeNull();

    // Exactly one row was revoked by the logout itself. The phone's successor
    // is revoked too, but by the rotation above, not by logout.
    const byLogout = [...store.rows.values()].filter((r) => r.revokedReason === 'LOGOUT');
    expect(byLogout).toHaveLength(1);

    // The laptop's session survives: logout is per-device, not per-account.
    expect([...store.rows.values()].some((r) => r.revokedAt === null)).toBe(true);
  });

  it('is idempotent for an already-revoked token', async () => {
    const { service } = await makeService(new ClockService());
    const issued = await service.issueRefreshToken('u1');

    expect(await service.revoke(issued.token)).toBe(true);
    expect(await service.revoke(issued.token)).toBe(false);
  });
});
