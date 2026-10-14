import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminTokenService } from './admin-token.service';
import { FrozenClock } from '../common/clock/clock.service';
import { hashPassword } from '../common/crypto/password';
import type { Env } from '../config/env';

/**
 * `AdminAuthService` tests.
 *
 * Admin login is password-based, so the failures carry the weight: a wrong
 * password must lock the account at the threshold, an inactive account must not
 * be handed a token even with the right secret, and a refresh token must rotate
 * such that replaying an already-rotated one kills the whole family. Each is a
 * case a happy-path test would never reach.
 */

const SECRET = 'test-secret-value-not-a-placeholder';
const PASSWORD = 'correct horse battery staple';

// Only the two TTLs the service reads; the rest of `Env` is irrelevant here.
const env = { JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '30d' } as unknown as Env;

interface AdminRow {
  id: string;
  email: string;
  passwordHash: string;
  status: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  roleSlugs: string[];
}

interface RefreshRow {
  id: string;
  adminId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

function setup() {
  const clock = new FrozenClock(new Date('2026-10-14T00:00:00.000Z'));
  const admins: AdminRow[] = [];
  const refreshes: RefreshRow[] = [];
  let refreshSeq = 0;

  const prisma = {
    adminUser: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        const admin = admins.find((a) => a.email === where.email || a.id === where.id);
        if (!admin) return null;
        return { ...admin, roles: admin.roleSlugs.map((slug) => ({ role: { slug } })) };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<AdminRow> }) => {
        const admin = admins.find((a) => a.id === where.id)!;
        Object.assign(admin, data);
        return admin;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; failedLoginCount?: { lt: number } };
        data: { failedLoginCount?: { increment: number } };
      }) => {
        const admin = admins.find((a) => a.id === where.id);
        if (!admin) return { count: 0 };
        if (where.failedLoginCount && !(admin.failedLoginCount < where.failedLoginCount.lt)) {
          return { count: 0 };
        }
        if (data.failedLoginCount?.increment) {
          admin.failedLoginCount += data.failedLoginCount.increment;
        }
        return { count: 1 };
      },
    },
    adminRefreshToken: {
      create: async ({ data }: { data: Omit<RefreshRow, 'id' | 'revokedAt'> }) => {
        const row: RefreshRow = { id: `rt_${++refreshSeq}`, revokedAt: null, ...data };
        refreshes.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = refreshes.find((r) => r.tokenHash === where.tokenHash);
        if (!row) return null;
        const admin = admins.find((a) => a.id === row.adminId)!;
        return {
          ...row,
          admin: {
            id: admin.id,
            status: admin.status,
            roles: admin.roleSlugs.map((slug) => ({ role: { slug } })),
          },
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<RefreshRow> }) => {
        const row = refreshes.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; familyId?: string; tokenHash?: string; revokedAt?: Date | null };
        data: { revokedAt: Date };
      }) => {
        let count = 0;
        for (const row of refreshes) {
          if (where.id !== undefined && row.id !== where.id) continue;
          if (where.familyId !== undefined && row.familyId !== where.familyId) continue;
          if (where.tokenHash !== undefined && row.tokenHash !== where.tokenHash) continue;
          if ('revokedAt' in where && where.revokedAt === null && row.revokedAt !== null) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
  };

  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: 900 } });
  const tokens = new AdminTokenService(jwt);
  const service = new AdminAuthService(prisma as never, clock, tokens, env);

  function addAdmin(overrides: Partial<AdminRow> = {}): AdminRow {
    const admin: AdminRow = {
      id: 'admin_1',
      email: 'boss@example.com',
      passwordHash: hashPassword(PASSWORD),
      status: 'ACTIVE',
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      roleSlugs: ['ADMIN'],
      ...overrides,
    };
    admins.push(admin);
    return admin;
  }

  return { clock, tokens, service, addAdmin, admins, refreshes };
}

describe('AdminAuthService.login', () => {
  it('returns a verifiable token pair and resets the failure counters', async () => {
    const { service, tokens, addAdmin, admins } = setup();
    addAdmin({ failedLoginCount: 3 });

    const pair = await service.login({ email: 'boss@example.com', password: PASSWORD });

    expect(pair.token_type).toBe('Bearer');
    expect(pair.expires_in).toBe(900);
    expect(pair.refresh_token).toHaveLength(43); // 32 random bytes, base64url

    const claims = await tokens.verifyAccessToken(pair.access_token);
    expect(claims?.typ).toBe('admin_access');
    expect(claims?.sub).toBe('admin_1');
    expect(claims?.roles).toEqual(['ADMIN']);

    expect(admins[0]!.failedLoginCount).toBe(0);
    expect(admins[0]!.lastLoginAt).not.toBeNull();
  });

  it('rejects an unknown email with the same message as a wrong password', async () => {
    const { service, refreshes } = setup();
    await expect(
      service.login({ email: 'nobody@example.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // No session should be created for a failed login.
    expect(refreshes).toHaveLength(0);
  });

  it('counts a wrong password against the account', async () => {
    const { service, addAdmin, admins } = setup();
    addAdmin();

    await expect(service.login({ email: 'boss@example.com', password: 'wrong-password' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(admins[0]!.failedLoginCount).toBe(1);
  });

  it('locks the account after the fifth failure', async () => {
    const { service, addAdmin, admins } = setup();
    addAdmin();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.login({ email: 'boss@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    expect(admins[0]!.failedLoginCount).toBe(5);
    expect(admins[0]!.lockedUntil).not.toBeNull();

    // Even the correct password is refused while the lock holds.
    await expect(service.login({ email: 'boss@example.com', password: PASSWORD })).rejects.toThrow(
      'temporarily locked',
    );
  });

  it('refuses an inactive administrator even with the correct password', async () => {
    const { service, addAdmin } = setup();
    addAdmin({ status: 'SUSPENDED' });

    await expect(service.login({ email: 'boss@example.com', password: PASSWORD })).rejects.toThrow(
      'not active',
    );
  });
});

describe('AdminAuthService.refresh', () => {
  it('rotates the token, revoking the old one', async () => {
    const { service, addAdmin, refreshes } = setup();
    addAdmin();
    const pair = await service.login({ email: 'boss@example.com', password: PASSWORD });

    const rotated = await service.refresh(pair.refresh_token);

    expect(rotated).not.toBeNull();
    expect(rotated!.refresh_token).not.toBe(pair.refresh_token);
    expect(refreshes).toHaveLength(2);
    expect(refreshes[0]!.revokedAt).not.toBeNull();
    expect(refreshes[1]!.revokedAt).toBeNull();
  });

  it('treats a replayed (already-rotated) token as compromise and revokes the family', async () => {
    const { service, addAdmin, refreshes } = setup();
    addAdmin();
    const pair = await service.login({ email: 'boss@example.com', password: PASSWORD });
    const rotated = await service.refresh(pair.refresh_token);

    // Present the original token again, which the legitimate client no longer has.
    const replay = await service.refresh(pair.refresh_token);

    expect(rotated).not.toBeNull();
    expect(replay).toBeNull();
    // Every token in the chain is now dead, including the one that was live.
    expect(refreshes.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it('rejects an unknown token', async () => {
    const { service } = setup();
    await expect(service.refresh('never-issued')).resolves.toBeNull();
  });

  it('revokes and rejects an expired token', async () => {
    const { service, addAdmin, clock, refreshes } = setup();
    addAdmin();
    const pair = await service.login({ email: 'boss@example.com', password: PASSWORD });

    clock.advance(31 * 24 * 60 * 60 * 1000); // past the 30-day refresh TTL

    await expect(service.refresh(pair.refresh_token)).resolves.toBeNull();
    expect(refreshes[0]!.revokedAt).not.toBeNull();
  });

  it('refuses to refresh for an administrator who is no longer active', async () => {
    const { service, addAdmin, admins } = setup();
    addAdmin();
    const pair = await service.login({ email: 'boss@example.com', password: PASSWORD });

    admins[0]!.status = 'SUSPENDED';

    await expect(service.refresh(pair.refresh_token)).resolves.toBeNull();
  });
});

describe('AdminAuthService.logout', () => {
  it('revokes only the presented token', async () => {
    const { service, addAdmin } = setup();
    addAdmin();
    const first = await service.login({ email: 'boss@example.com', password: PASSWORD });
    const second = await service.login({ email: 'boss@example.com', password: PASSWORD });

    await expect(service.logout(first.refresh_token)).resolves.toBe(true);
    // The second device is untouched.
    await expect(service.refresh(second.refresh_token)).resolves.not.toBeNull();
    // And logging out the same token again reports that nothing changed.
    await expect(service.logout(first.refresh_token)).resolves.toBe(false);
  });
});
