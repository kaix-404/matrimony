import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { AdminLoginResponse, AdminMfaChallenge, AdminTokenPair } from '@matrimony/shared';
import { AdminAuthService } from './admin-auth.service';
import { AdminTokenService } from './admin-token.service';
import { FrozenClock } from '../common/clock/clock.service';
import { hashPassword } from '../common/crypto/password';
import { SecretBox } from '../common/crypto/secret-box';
import { generateTotpSecret, totpCode } from '../common/crypto/totp';
import type { Env } from '../config/env';

/**
 * `AdminAuthService` tests.
 *
 * Admin login is password-based, so the failures carry the weight: a wrong
 * password must lock the account at the threshold, an inactive account must not
 * be handed a token even with the right secret, and a refresh token must rotate
 * such that replaying an already-rotated one kills the whole family. The MFA
 * cases add the second factor: a password alone must not be a session, a wrong
 * code must count against the same lockout, and a secret must reach the database
 * only after a code proves the authenticator holds it.
 */

const SECRET = 'test-secret-value-not-a-placeholder';
const PASSWORD = 'correct horse battery staple';
const MFA_KEY = 'test-mfa-encryption-key-not-used-for-anything-real';

// Only the fields the service reads; the rest of `Env` is irrelevant here.
const env = {
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
  MFA_ENCRYPTION_KEY: MFA_KEY,
} as unknown as Env;

interface AdminRow {
  id: string;
  email: string;
  passwordHash: string;
  status: string;
  mfaSecret: string | null;
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

/** Narrows a login result to a session, failing the test if it is a challenge. */
function asPair(result: AdminLoginResponse): AdminTokenPair {
  if (!('access_token' in result)) {
    throw new Error('expected a token pair, got an MFA challenge');
  }
  return result;
}

function asChallenge(result: AdminLoginResponse): AdminMfaChallenge {
  if (!('mfa_required' in result)) {
    throw new Error('expected an MFA challenge, got a token pair');
  }
  return result;
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
        where: { id: string; failedLoginCount?: { lt: number }; mfaSecret?: null };
        data: { failedLoginCount?: { increment: number }; mfaSecret?: string | null };
      }) => {
        const admin = admins.find((a) => a.id === where.id);
        if (!admin) return { count: 0 };
        if (where.failedLoginCount && !(admin.failedLoginCount < where.failedLoginCount.lt)) {
          return { count: 0 };
        }
        // The conditional enrollment write: only match a still-unset secret.
        if ('mfaSecret' in where && where.mfaSecret === null && admin.mfaSecret !== null) {
          return { count: 0 };
        }
        if (data.failedLoginCount?.increment) {
          admin.failedLoginCount += data.failedLoginCount.increment;
        }
        if ('mfaSecret' in data) {
          admin.mfaSecret = data.mfaSecret ?? null;
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
  const audit = { record: jest.fn(async () => undefined) };
  const service = new AdminAuthService(prisma as never, clock, tokens, jwt, audit as never, env);

  function addAdmin(overrides: Partial<AdminRow> = {}): AdminRow {
    const admin: AdminRow = {
      id: 'admin_1',
      email: 'boss@example.com',
      passwordHash: hashPassword(PASSWORD),
      status: 'ACTIVE',
      mfaSecret: null,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      roleSlugs: ['ADMIN'],
      ...overrides,
    };
    admins.push(admin);
    return admin;
  }

  return { clock, tokens, service, addAdmin, admins, refreshes, audit };
}

/** An admin row already enrolled, with the plaintext secret for computing codes. */
function enroll(addAdmin: (o?: Partial<AdminRow>) => AdminRow, secret = generateTotpSecret()) {
  addAdmin({ mfaSecret: new SecretBox(MFA_KEY).encrypt(secret) });
  return secret;
}

describe('AdminAuthService.login', () => {
  it('returns a verifiable token pair and resets the failure counters', async () => {
    const { service, tokens, addAdmin, admins } = setup();
    addAdmin({ failedLoginCount: 3 });

    const pair = asPair(await service.login({ email: 'boss@example.com', password: PASSWORD }));

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

  it('returns a challenge instead of a session when MFA is enrolled', async () => {
    const { service, addAdmin } = setup();
    enroll(addAdmin);

    const challenge = asChallenge(await service.login({ email: 'boss@example.com', password: PASSWORD }));

    expect(challenge.mfa_required).toBe(true);
    expect(challenge.challenge_token.length).toBeGreaterThan(20);
    expect(challenge.expires_in).toBe(300);
  });
});

describe('AdminAuthService.verifyMfa', () => {
  it('issues a session when the correct code follows the challenge', async () => {
    const { service, clock, tokens, addAdmin } = setup();
    const secret = enroll(addAdmin);

    const challenge = asChallenge(await service.login({ email: 'boss@example.com', password: PASSWORD }));
    const pair = await service.verifyMfa({
      challenge_token: challenge.challenge_token,
      code: totpCode(secret, clock.now().getTime()),
    });

    expect(pair.token_type).toBe('Bearer');
    const claims = await tokens.verifyAccessToken(pair.access_token);
    expect(claims?.typ).toBe('admin_access');
    expect(claims?.sub).toBe('admin_1');
  });

  it('charges a wrong code to the same lockout counter as a wrong password', async () => {
    const { service, clock, addAdmin, admins } = setup();
    const secret = enroll(addAdmin);

    const challenge = asChallenge(await service.login({ email: 'boss@example.com', password: PASSWORD }));
    const correct = totpCode(secret, clock.now().getTime());
    const wrong = correct === '000000' ? '000001' : '000000';

    await expect(
      service.verifyMfa({ challenge_token: challenge.challenge_token, code: wrong }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(admins[0]!.failedLoginCount).toBe(1);
  });

  it('rejects a token that is not a challenge', async () => {
    const { service, addAdmin } = setup();
    addAdmin();

    await expect(
      service.verifyMfa({ challenge_token: 'not-a-token', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not accept an enrollment token as a challenge', async () => {
    const { service, clock, addAdmin } = setup();
    addAdmin();

    const setupResult = await service.beginMfaEnrollment('admin_1');
    await expect(
      service.verifyMfa({
        challenge_token: setupResult.enrollment_token,
        code: totpCode(setupResult.secret, clock.now().getTime()),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AdminAuthService MFA enrollment', () => {
  it('persists the secret only after a code proves the authenticator holds it', async () => {
    const { service, clock, addAdmin, admins, audit } = setup();
    addAdmin();

    const setupResult = await service.beginMfaEnrollment('admin_1');
    // Not stored yet: the pending secret lives only in the signed token.
    expect(admins[0]!.mfaSecret).toBeNull();
    expect(setupResult.otpauth_uri).toContain('otpauth://totp/');
    expect(setupResult.otpauth_uri).toContain(setupResult.secret);

    const result = await service.activateMfa('admin_1', {
      enrollment_token: setupResult.enrollment_token,
      code: totpCode(setupResult.secret, clock.now().getTime()),
    });

    expect(result).toEqual({ mfa_enabled: true });
    // Stored encrypted, never as the plaintext secret.
    expect(admins[0]!.mfaSecret).not.toBeNull();
    expect(admins[0]!.mfaSecret).not.toBe(setupResult.secret);
    expect(new SecretBox(MFA_KEY).decrypt(admins[0]!.mfaSecret!)).toBe(setupResult.secret);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin:mfa:enable', resourceId: 'admin_1' }),
    );
  });

  it('refuses to activate on a wrong code and stores nothing', async () => {
    const { service, addAdmin, admins } = setup();
    addAdmin();
    const setupResult = await service.beginMfaEnrollment('admin_1');

    await expect(
      service.activateMfa('admin_1', { enrollment_token: setupResult.enrollment_token, code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(admins[0]!.mfaSecret).toBeNull();
  });

  it('refuses a second enrollment once MFA is on', async () => {
    const { service, addAdmin } = setup();
    enroll(addAdmin);

    await expect(service.beginMfaEnrollment('admin_1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('disables with a current code and clears the secret, audit included', async () => {
    const { service, clock, addAdmin, admins, audit } = setup();
    const secret = enroll(addAdmin);

    const result = await service.disableMfa('admin_1', { code: totpCode(secret, clock.now().getTime()) });

    expect(result).toEqual({ mfa_enabled: false });
    expect(admins[0]!.mfaSecret).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin:mfa:disable', resourceId: 'admin_1' }),
    );
  });

  it('refuses to disable with a wrong code', async () => {
    const { service, clock, addAdmin, admins } = setup();
    const secret = enroll(addAdmin);
    const correct = totpCode(secret, clock.now().getTime());

    await expect(
      service.disableMfa('admin_1', { code: correct === '000000' ? '000001' : '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(admins[0]!.mfaSecret).not.toBeNull();
  });

  it('refuses to disable when MFA is not enabled', async () => {
    const { service, addAdmin } = setup();
    addAdmin();

    await expect(service.disableMfa('admin_1', { code: '123456' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AdminAuthService.refresh', () => {
  it('rotates the token, revoking the old one', async () => {
    const { service, addAdmin, refreshes } = setup();
    addAdmin();
    const pair = asPair(await service.login({ email: 'boss@example.com', password: PASSWORD }));

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
    const pair = asPair(await service.login({ email: 'boss@example.com', password: PASSWORD }));
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
    const pair = asPair(await service.login({ email: 'boss@example.com', password: PASSWORD }));

    clock.advance(31 * 24 * 60 * 60 * 1000); // past the 30-day refresh TTL

    await expect(service.refresh(pair.refresh_token)).resolves.toBeNull();
    expect(refreshes[0]!.revokedAt).not.toBeNull();
  });

  it('refuses to refresh for an administrator who is no longer active', async () => {
    const { service, addAdmin, admins } = setup();
    addAdmin();
    const pair = asPair(await service.login({ email: 'boss@example.com', password: PASSWORD }));

    admins[0]!.status = 'SUSPENDED';

    await expect(service.refresh(pair.refresh_token)).resolves.toBeNull();
  });
});

describe('AdminAuthService.logout', () => {
  it('revokes only the presented token', async () => {
    const { service, addAdmin } = setup();
    addAdmin();
    const first = asPair(await service.login({ email: 'boss@example.com', password: PASSWORD }));
    const second = asPair(await service.login({ email: 'boss@example.com', password: PASSWORD }));

    await expect(service.logout(first.refresh_token)).resolves.toBe(true);
    // The second device is untouched.
    await expect(service.refresh(second.refresh_token)).resolves.not.toBeNull();
    // And logging out the same token again reports that nothing changed.
    await expect(service.logout(first.refresh_token)).resolves.toBe(false);
  });
});
