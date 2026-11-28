import { JwtService } from '@nestjs/jwt';
import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AdminLoginResponse, AdminMfaChallenge, AdminTokenPair } from '@matrimony/shared';
import { AdminAuthService } from './admin-auth.service';
import { AdminTokenService } from './admin-token.service';
import { FrozenClock } from '../common/clock/clock.service';
import { hashPassword } from '../common/crypto/password';
import { OtpService } from '../auth/otp.service';
import { createFakeOtpTable } from '../testing/fake-otp-table';
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
const PHONE = '9876543210';
/** What the fake OTP store says it minted. */
const TEXTED_CODE = '424242';

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
  phone: string | null;
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

function setup(nodeEnv: string = 'test', realOtpStore = false) {
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
  // The OTP store and the SMS gateway are faked rather than exercised: what is
  // under test is which factor the sign-in asks for and what it accepts, not the
  // hashing and expiry rules, which `OtpService`'s own tests cover.
  const otp = {
    issue: jest.fn(async () => ({
      id: 'otp_1',
      code: TEXTED_CODE,
      resendAfterAt: new Date('2026-01-01T00:01:00.000Z'),
      expiresAt: new Date('2026-01-01T00:05:00.000Z'),
    })),
    verify: jest.fn(
      async (_input: { mobile: string; purpose: string; code: string }) => 'otp_1' as string | null,
    ),
    discardUndelivered: jest.fn(async (_id: string) => undefined),
  };
  const sms = {
    configured: true,
    sendOtp: jest.fn(async (_input: { mobile: string; code: string }) => ({
      providerMessageId: 'msg_1',
      reportedZeroBalance: false,
    })),
  };
  // The real `OtpService` over an in-memory `otpRequest` table. Most tests here
  // stand in for the OTP service, which is right for "which factor is asked for";
  // the block below at the end turns this on to cover the store path itself.
  const otpTable = createFakeOtpTable();
  const otpService = new OtpService({ otpRequest: otpTable } as never, clock, {
    ...env,
    OTP_HASH_SECRET: 'test-otp-pepper',
    OTP_MAX_ATTEMPTS: 3,
    OTP_RESEND_COOLDOWN_SECONDS: 60,
    OTP_TTL_SECONDS: 300,
  } as unknown as Env);

  const service = new AdminAuthService(
    prisma as never,
    clock,
    tokens,
    jwt,
    audit as never,
    (realOtpStore ? otpService : otp) as never,
    sms as never,
    { ...env, NODE_ENV: nodeEnv } as unknown as Env,
  );

  function addAdmin(overrides: Partial<AdminRow> = {}): AdminRow {
    const admin: AdminRow = {
      id: 'admin_1',
      email: 'boss@example.com',
      passwordHash: hashPassword(PASSWORD),
      status: 'ACTIVE',
      mfaSecret: null,
      phone: null,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      roleSlugs: ['ADMIN'],
      ...overrides,
    };
    admins.push(admin);
    return admin;
  }

  return {
    clock,
    tokens,
    service,
    addAdmin,
    admins,
    refreshes,
    audit,
    otp,
    otpService,
    otpTable,
    sms,
  };
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

    await expect(
      service.login({ email: 'boss@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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

    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );

    expect(challenge.mfa_required).toBe(true);
    expect(challenge.challenge_token.length).toBeGreaterThan(20);
    expect(challenge.expires_in).toBe(300);
  });
});

describe('AdminAuthService.verifyMfa', () => {
  it('issues a session when the correct code follows the challenge', async () => {
    const { service, clock, tokens, addAdmin } = setup();
    const secret = enroll(addAdmin);

    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );
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

    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );
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
      service.activateMfa('admin_1', {
        enrollment_token: setupResult.enrollment_token,
        code: '000000',
      }),
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

    const result = await service.disableMfa('admin_1', {
      code: totpCode(secret, clock.now().getTime()),
    });

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

describe('AdminAuthService.login with an SMS sign-in number', () => {
  it('texts a code and asks for it when no authenticator is enrolled', async () => {
    const { service, addAdmin, otp, sms } = setup();
    addAdmin({ phone: PHONE });

    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );

    expect(challenge.method).toBe('sms');
    // The prompt names where the code went without printing the number back.
    expect(challenge.phone_hint).toBe('••••••3210');
    expect(otp.issue).toHaveBeenCalledWith({ mobile: PHONE, purpose: 'ADMIN_LOGIN' });
    expect(sms.sendOtp).toHaveBeenCalledWith({ mobile: PHONE, code: TEXTED_CODE });
  });

  it('signs nothing in before the code is answered', async () => {
    const { service, addAdmin, admins } = setup();
    addAdmin({ phone: PHONE });

    await service.login({ email: 'boss@example.com', password: PASSWORD });

    // A correct password alone must not look like a completed sign-in.
    expect(admins[0]!.lastLoginAt).toBeNull();
  });

  it('prefers the authenticator when the account has both', async () => {
    const { service, addAdmin, otp, sms } = setup();
    addAdmin({ phone: PHONE, mfaSecret: new SecretBox(MFA_KEY).encrypt(generateTotpSecret()) });

    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );

    // TOTP works offline and costs nothing to deliver, so it stays the factor for
    // an account that has one; the number is not a second, weaker door.
    expect(challenge.method).toBe('totp');
    expect(challenge.phone_hint).toBeNull();
    expect(otp.issue).not.toHaveBeenCalled();
    expect(sms.sendOtp).not.toHaveBeenCalled();
  });

  it('refuses the SMS step in production when SMS delivery is not configured', async () => {
    const { service, addAdmin, sms } = setup('production');
    addAdmin({ phone: PHONE });
    sms.configured = false;

    // Neither a lockout at a code screen nor a silent downgrade to the password
    // alone: the sign-in says the factor is unavailable.
    await expect(
      service.login({ email: 'boss@example.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('answers a gateway error when the code cannot be sent', async () => {
    const { service, addAdmin, sms } = setup();
    addAdmin({ phone: PHONE });
    sms.sendOtp.mockRejectedValueOnce(new Error('provider unreachable'));

    // A code nobody received is not a credential failure: reporting "invalid
    // credentials" would send the operator to reset a password that is fine.
    await expect(
      service.login({ email: 'boss@example.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('retires an unsent sign-in code, so the next attempt is not held by its cooldown', async () => {
    // Minted before the send could fail: left standing, the code would stay
    // answerable for its whole TTL and its timestamp would delay the retry the
    // failure message just invited. The store is real here, because the cooldown
    // is a property of the row rather than of this service.
    const { service, addAdmin, sms, otpTable, otpService } = setup('test', true);
    addAdmin({ phone: PHONE });
    sms.sendOtp.mockRejectedValueOnce(new Error('provider unreachable'));

    await expect(
      service.login({ email: 'boss@example.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(otpTable.rows).toHaveLength(1);
    expect(otpTable.rows[0]!.status).toBe('EXPIRED');
    expect(await otpService.remainingResendSeconds(PHONE, 'ADMIN_LOGIN')).toBe(0);

    // And the retry gets a fresh code rather than an answerable stale one.
    const retry = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );
    expect(sms.sendOtp).toHaveBeenCalledTimes(2);
    expect(otpTable.rows.filter((row) => row.status === 'PENDING')).toHaveLength(1);
    expect(retry.challenge_token).toBeDefined();
  });

  it('still signs in with the password alone when no factor is enrolled', async () => {
    const { service, addAdmin } = setup();
    addAdmin();

    const pair = asPair(await service.login({ email: 'boss@example.com', password: PASSWORD }));

    expect(pair.token_type).toBe('Bearer');
  });
});

describe('AdminAuthService.verifyMfa with a texted code', () => {
  async function smsChallenge() {
    const ctx = setup();
    ctx.addAdmin({ phone: PHONE });
    const challenge = asChallenge(
      await ctx.service.login({ email: 'boss@example.com', password: PASSWORD }),
    );
    return { ...ctx, challenge };
  }

  it('accepts the code the OTP store vouches for', async () => {
    const { service, challenge, otp, admins } = await smsChallenge();

    const pair = await service.verifyMfa({
      challenge_token: challenge.challenge_token,
      code: TEXTED_CODE,
    });

    expect(pair.token_type).toBe('Bearer');
    expect(otp.verify).toHaveBeenCalledWith({
      mobile: PHONE,
      purpose: 'ADMIN_LOGIN',
      code: TEXTED_CODE,
    });
    expect(admins[0]!.lastLoginAt).not.toBeNull();
  });

  it('charges a rejected code to the lockout counter', async () => {
    const { service, challenge, otp, admins } = await smsChallenge();
    otp.verify.mockResolvedValueOnce(null);

    await expect(
      service.verifyMfa({ challenge_token: challenge.challenge_token, code: '000000' }),
    ).rejects.toThrow('Invalid code');

    expect(admins[0]!.failedLoginCount).toBe(1);
  });

  it('cannot answer an authenticator challenge with a texted code', async () => {
    const { service, addAdmin, otp } = setup();
    const secret = generateTotpSecret();
    addAdmin({ phone: PHONE, mfaSecret: new SecretBox(MFA_KEY).encrypt(secret) });
    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );

    await expect(
      service.verifyMfa({ challenge_token: challenge.challenge_token, code: TEXTED_CODE }),
    ).rejects.toThrow('Invalid code');

    // The weaker channel is not consulted at all for a TOTP challenge.
    expect(otp.verify).not.toHaveBeenCalled();
  });
});

describe('AdminAuthService.login with the real OTP store', () => {
  /** The six digits the gateway was last asked to deliver. */
  function textedCode(sms: ReturnType<typeof setup>['sms']): string {
    const calls = sms.sendOtp.mock.calls;
    const last = calls[calls.length - 1];
    if (!last) throw new Error('no sign-in code was sent');
    return last[0].code;
  }

  it('accepts the code the store minted, keeping only its hash', async () => {
    const { service, addAdmin, sms, otpTable } = setup('test', true);
    addAdmin({ phone: PHONE });

    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );
    const code = textedCode(sms);

    // A code that reached the database in the clear would be a stored credential.
    expect(otpTable.rows[0]!.codeHash).not.toContain(code);
    expect(otpTable.rows[0]!.purpose).toBe('ADMIN_LOGIN');

    const pair = await service.verifyMfa({
      challenge_token: challenge.challenge_token,
      code,
    });

    expect(pair.token_type).toBe('Bearer');
    expect(otpTable.rows[0]!.status).toBe('VERIFIED');
  });

  it('refuses the same texted code a second time', async () => {
    const { service, addAdmin, sms } = setup('test', true);
    addAdmin({ phone: PHONE });
    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );
    const code = textedCode(sms);

    await service.verifyMfa({ challenge_token: challenge.challenge_token, code });

    await expect(
      service.verifyMfa({ challenge_token: challenge.challenge_token, code }),
    ).rejects.toThrow('Invalid code');
  });

  it('cannot be answered with a code minted for a member sign-in', async () => {
    const { service, addAdmin, otpService, sms } = setup('test', true);
    addAdmin({ phone: PHONE });
    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );
    const adminCode = textedCode(sms);

    // A code the same number obtained from the member login flow proves the
    // number, not the administrator. Purpose is part of the lookup.
    const member = await otpService.issue({ mobile: PHONE, purpose: 'LOGIN' });

    await expect(
      service.verifyMfa({ challenge_token: challenge.challenge_token, code: member.code }),
    ).rejects.toThrow('Invalid code');

    // And the admin's own code survived: the member request superseded nothing.
    await expect(
      service.verifyMfa({ challenge_token: challenge.challenge_token, code: adminCode }),
    ).resolves.toMatchObject({ token_type: 'Bearer' });
  });

  it('stops accepting a code once the store has spent its attempts', async () => {
    const { service, addAdmin, sms } = setup('test', true);
    addAdmin({ phone: PHONE });
    const challenge = asChallenge(
      await service.login({ email: 'boss@example.com', password: PASSWORD }),
    );
    const code = textedCode(sms);
    const wrong = code === '000000' ? '000001' : '000000';

    // OTP_MAX_ATTEMPTS is 3 above, so the correct code is worthless afterwards —
    // the attempt ceiling is the store's, not something the caller can reset by
    // asking for a new challenge.
    for (let guess = 0; guess < 3; guess += 1) {
      await expect(
        service.verifyMfa({ challenge_token: challenge.challenge_token, code: wrong }),
      ).rejects.toThrow('Invalid code');
    }

    await expect(
      service.verifyMfa({ challenge_token: challenge.challenge_token, code }),
    ).rejects.toThrow('Invalid code');
  });
});
