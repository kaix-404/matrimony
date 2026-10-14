import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  AdminLoginResponse,
  AdminMfaActivateInput,
  AdminMfaActivateView,
  AdminMfaChallenge,
  AdminMfaDisableInput,
  AdminMfaDisableView,
  AdminMfaSetupView,
  AdminMfaVerifyInput,
  AdminTokenPair,
} from '@matrimony/shared';
import { AdminTokenService } from './admin-token.service';
import { AuditService } from './audit.service';
import { ClockService } from '../common/clock/clock.service';
import { PrismaClient, UserStatus, type AdminRoleSlug } from '../prisma/prisma-client';
import { hashPassword, verifyPassword } from '../common/crypto/password';
import { SecretBox } from '../common/crypto/secret-box';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../common/crypto/totp';
import { parseDurationSeconds } from '../auth/token.service';
import type { Env } from '../config/env';

/** Failed verifications tolerated before an admin account is locked. */
const MAX_FAILED_LOGINS = 5;
/** Lockout duration once that count is reached. */
const LOCKOUT_MINUTES = 15;
const REFRESH_TOKEN_BYTES = 32;
/** How long a password-check MFA challenge stays usable. */
const MFA_CHALLENGE_TTL_SECONDS = 300;
/** How long a pending TOTP enrollment stays usable before it must be restarted. */
const MFA_ENROLLMENT_TTL_SECONDS = 600;
/** Shown in the authenticator app next to the account. */
const MFA_ISSUER = 'Networth Matrimony';

/**
 * Administrator sign-in and session lifecycle.
 *
 * Admins are the only password principals, so this service is where the
 * password check, the lockout and the token pair meet. It deliberately mirrors
 * the member `TokenService`/`AuthService` split: `AdminTokenService` signs the
 * stateless access JWT, and the refresh tokens here are opaque rotating strings
 * checked against `AdminRefreshToken`.
 *
 * TOKEN SEPARATION
 * ----------------
 * The access token this issues carries `typ: 'admin_access'`. `AdminAuthGuard`
 * accepts only that, and the member guard accepts only `typ: 'access'`, so even
 * though both are signed with `JWT_ACCESS_SECRET` neither credential can be
 * replayed against the other surface.
 */
@Injectable()
export class AdminAuthService {
  private readonly env: Env;

  /**
   * A valid-but-unmatchable hash used to spend the same scrypt work when the
   * email is unknown. Without it, "no such admin" would answer in microseconds
   * and "wrong password" in tens of milliseconds, and the difference alone would
   * let an attacker enumerate administrator emails.
   */
  private static readonly DUMMY_HASH = hashPassword('not-a-real-administrator-password');

  /**
   * Built lazily so a deployment that never uses MFA — and every unit test that
   * does not exercise it — never touches the encryption key. A missing key then
   * fails at the MFA call rather than at wiring time.
   */
  private secretBoxInstance?: SecretBox;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
    private readonly tokens: AdminTokenService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject('ENV') env: Env,
  ) {
    this.env = env;
  }

  /**
   * Verifies credentials and returns a fresh token pair.
   *
   * Every failure answers with the same message. Telling a caller that the email
   * exists but the password is wrong — or that the account is locked versus
   * unknown — hands them a way to confirm which addresses are administrators.
   * The lockout and the status check are still applied; only the wording is
   * shared.
   */
  async login(input: { email: string; password: string }): Promise<AdminLoginResponse> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        status: true,
        passwordHash: true,
        mfaSecret: true,
        lockedUntil: true,
        roles: { select: { role: { select: { slug: true } } } },
      },
    });

    const now = this.clock.now();

    if (!admin) {
      verifyPassword(input.password, AdminAuthService.DUMMY_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (admin.lockedUntil && admin.lockedUntil.getTime() > now.getTime()) {
      throw new UnauthorizedException('Account temporarily locked. Try again later.');
    }

    if (!verifyPassword(input.password, admin.passwordHash)) {
      await this.recordFailedLogin(admin.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    // A correct password is not enough: a suspended or deleted administrator
    // must not receive a token just because they know their secret.
    if (admin.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // When a second factor is enrolled, stop at the password. The failure counter
    // and `lastLoginAt` are only reset once the code is verified, so a stolen
    // password cannot clear the lockout trail or fake a completed sign-in.
    if (admin.mfaSecret) {
      return this.issueMfaChallenge(admin.id);
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: now, failedLoginCount: 0, lockedUntil: null },
    });

    return this.issuePair(admin.id, admin.roles.map((assignment) => assignment.role.slug));
  }

  /**
   * Completes an MFA login with a current code and the challenge from `login`.
   *
   * A wrong code is charged to the same lockout counter as a wrong password, so
   * the number of guesses is bounded at five across both stages rather than five
   * per stage. The challenge names an administrator and nothing else; it is not a
   * session and is accepted by no other endpoint.
   */
  async verifyMfa(input: AdminMfaVerifyInput): Promise<AdminTokenPair> {
    const claims = await this.verifyScopedToken(input.challenge_token, 'mfa_challenge');
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired MFA challenge');
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        status: true,
        mfaSecret: true,
        lockedUntil: true,
        roles: { select: { role: { select: { slug: true } } } },
      },
    });

    const now = this.clock.now();
    if (!admin || admin.status !== UserStatus.ACTIVE || !admin.mfaSecret) {
      throw new UnauthorizedException('Invalid or expired MFA challenge');
    }
    if (admin.lockedUntil && admin.lockedUntil.getTime() > now.getTime()) {
      throw new UnauthorizedException('Account temporarily locked. Try again later.');
    }

    const secret = this.tryDecryptSecret(admin.mfaSecret);
    if (!secret || !verifyTotp(secret, input.code, now.getTime())) {
      await this.recordFailedLogin(admin.id);
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: now, failedLoginCount: 0, lockedUntil: null },
    });

    return this.issuePair(admin.id, admin.roles.map((assignment) => assignment.role.slug));
  }

  /**
   * Starts TOTP enrollment for the authenticated administrator.
   *
   * The secret is generated here but not stored: it travels back in a signed,
   * short-lived enrollment token, and only `activateMfa` persists it. That is why
   * a secret in the database always means a working second factor rather than a
   * half-finished setup.
   */
  async beginMfaEnrollment(adminId: string): Promise<AdminMfaSetupView> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, mfaSecret: true },
    });
    if (!admin) {
      throw new UnauthorizedException('Not authenticated as an administrator');
    }
    if (admin.mfaSecret) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = generateTotpSecret();
    const enrollmentToken = await this.jwt.signAsync(
      { sub: adminId, typ: 'mfa_enroll', secret },
      { expiresIn: MFA_ENROLLMENT_TTL_SECONDS },
    );

    return {
      secret,
      otpauth_uri: otpauthUri({ issuer: MFA_ISSUER, account: admin.email, secret }),
      enrollment_token: enrollmentToken,
      expires_in: MFA_ENROLLMENT_TTL_SECONDS,
    };
  }

  /**
   * Confirms enrollment by proving the authenticator holds the pending secret,
   * then persists the encrypted secret.
   */
  async activateMfa(adminId: string, input: AdminMfaActivateInput): Promise<AdminMfaActivateView> {
    const claims = await this.verifyScopedToken(input.enrollment_token, 'mfa_enroll');
    const secret = claims && typeof claims.secret === 'string' ? claims.secret : null;
    if (!claims || !secret || claims.sub !== adminId) {
      throw new UnauthorizedException('Invalid or expired enrollment');
    }

    if (!verifyTotp(secret, input.code, this.clock.now().getTime())) {
      throw new UnauthorizedException('Invalid code');
    }

    // Conditional on still being unset: two overlapping enrollments must not let
    // the second silently overwrite a confirmed secret with its own.
    const updated = await this.prisma.adminUser.updateMany({
      where: { id: adminId, mfaSecret: null },
      data: { mfaSecret: this.box().encrypt(secret) },
    });
    if (updated.count === 0) {
      throw new BadRequestException('MFA is already enabled');
    }

    await this.audit.record({
      actorAdminId: adminId,
      action: 'admin:mfa:enable',
      resourceType: 'AdminUser',
      resourceId: adminId,
      newValue: { mfa_enabled: true },
    });

    return { mfa_enabled: true };
  }

  /**
   * Turns MFA off, but only with a current code. A session alone is not enough to
   * shed the second factor, which is the point of having one.
   */
  async disableMfa(adminId: string, input: AdminMfaDisableInput): Promise<AdminMfaDisableView> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, mfaSecret: true },
    });
    if (!admin || !admin.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    const secret = this.tryDecryptSecret(admin.mfaSecret);
    if (!secret || !verifyTotp(secret, input.code, this.clock.now().getTime())) {
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.adminUser.update({ where: { id: adminId }, data: { mfaSecret: null } });

    await this.audit.record({
      actorAdminId: adminId,
      action: 'admin:mfa:disable',
      resourceType: 'AdminUser',
      resourceId: adminId,
      previousValue: { mfa_enabled: true },
      newValue: { mfa_enabled: false },
    });

    return { mfa_enabled: false };
  }

  /**
   * Exchanges a refresh token for a new pair, rotating it.
   *
   * Reuse detection is the reason the token is opaque and stored hashed rather
   * than being a JWT: a JWT cannot be un-issued, so a copied one would stay valid
   * until expiry with no way to notice it had been used twice. Presenting an
   * already-rotated token here revokes the whole family, on the reasoning that
   * one of the two holders is a thief and the safe end state is that neither
   * keeps a working token.
   */
  async refresh(presentedToken: string): Promise<AdminTokenPair | null> {
    const tokenHash = this.hashToken(presentedToken);
    const now = this.clock.now();

    const existing = await this.prisma.adminRefreshToken.findUnique({
      where: { tokenHash },
      include: {
        admin: {
          select: {
            id: true,
            status: true,
            roles: { select: { role: { select: { slug: true } } } },
          },
        },
      },
    });

    if (!existing) {
      return null;
    }

    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId, now);
      return null;
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.adminRefreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: now },
      });
      return null;
    }

    if (existing.admin.status !== UserStatus.ACTIVE) {
      return null;
    }

    // `revokedAt: null` in the predicate makes the rotation safe against two
    // concurrent refreshes: exactly one update matches and the loser falls
    // through to the reuse branch, where the family is revoked.
    const rotated = await this.prisma.adminRefreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });

    if (rotated.count === 0) {
      await this.revokeFamily(existing.familyId, now);
      return null;
    }

    return this.issuePair(
      existing.admin.id,
      existing.admin.roles.map((assignment) => assignment.role.slug),
      existing.familyId,
    );
  }

  /**
   * Revokes the presented refresh token only.
   *
   * Logging out on one device must not sign the administrator out everywhere,
   * which revoking the family would do.
   */
  async logout(presentedToken: string): Promise<boolean> {
    const result = await this.prisma.adminRefreshToken.updateMany({
      where: { tokenHash: this.hashToken(presentedToken), revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    return result.count > 0;
  }

  private async issuePair(
    adminId: string,
    roleSlugs: AdminRoleSlug[],
    familyId?: string,
  ): Promise<AdminTokenPair> {
    const refresh = await this.issueRefreshToken(adminId, familyId);
    return {
      access_token: await this.tokens.issueAccessToken({ id: adminId, roles: roleSlugs }),
      refresh_token: refresh.token,
      token_type: 'Bearer',
      expires_in: this.accessTtlSeconds(),
    };
  }

  private async issueRefreshToken(
    adminId: string,
    familyId?: string,
  ): Promise<{ token: string; familyId: string }> {
    const family = familyId ?? randomBytes(16).toString('hex');
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(this.clock.now().getTime() + this.refreshTtlMs());

    await this.prisma.adminRefreshToken.create({
      data: { adminId, tokenHash: this.hashToken(token), familyId: family, expiresAt },
    });

    return { token, familyId: family };
  }

  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.adminRefreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  /** Signs the short-lived challenge an MFA-enabled login returns. */
  private async issueMfaChallenge(adminId: string): Promise<AdminMfaChallenge> {
    const challengeToken = await this.jwt.signAsync(
      { sub: adminId, typ: 'mfa_challenge' },
      { expiresIn: MFA_CHALLENGE_TTL_SECONDS },
    );
    return {
      mfa_required: true,
      challenge_token: challengeToken,
      expires_in: MFA_CHALLENGE_TTL_SECONDS,
    };
  }

  /**
   * Verifies a challenge or enrollment token, returning null unless its `typ`
   * matches and it names an administrator. That `typ` check is what keeps either
   * token from being usable as an `admin_access` token, and vice-versa.
   */
  private async verifyScopedToken(
    token: string,
    typ: 'mfa_challenge' | 'mfa_enroll',
  ): Promise<(Record<string, unknown> & { sub: string }) | null> {
    try {
      const claims = await this.jwt.verifyAsync<Record<string, unknown>>(token);
      return claims.typ === typ && typeof claims.sub === 'string'
        ? (claims as Record<string, unknown> & { sub: string })
        : null;
    } catch {
      return null;
    }
  }

  /** The encryptor for stored TOTP secrets, constructed on first MFA use. */
  private box(): SecretBox {
    return (this.secretBoxInstance ??= new SecretBox(this.env.MFA_ENCRYPTION_KEY));
  }

  /**
   * Decrypts a stored secret, returning null on a malformed value or the wrong
   * key. A rotated key therefore reads as "no usable secret" — the login fails
   * closed and the administrator is reset rather than signing in with a factor
   * that cannot be checked.
   */
  private tryDecryptSecret(stored: string): string | null {
    try {
      return this.box().decrypt(stored);
    } catch {
      return null;
    }
  }

  /**
   * Records a failed password check and locks at the threshold.
   *
   * The increment and the threshold test happen in one conditional update so two
   * concurrent failures both seeing `count = 4` cannot both assume the next one
   * is harmless.
   */
  private async recordFailedLogin(adminId: string): Promise<void> {
    const now = this.clock.now();
    const updated = await this.prisma.adminUser.updateMany({
      where: { id: adminId, failedLoginCount: { lt: MAX_FAILED_LOGINS } },
      data: { failedLoginCount: { increment: 1 } },
    });

    if (updated.count === 0) {
      return;
    }

    const reloaded = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { failedLoginCount: true },
    });

    if (reloaded && reloaded.failedLoginCount >= MAX_FAILED_LOGINS) {
      await this.prisma.adminUser.update({
        where: { id: adminId },
        data: { lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) },
      });
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessTtlSeconds(): number {
    return parseDurationSeconds(this.env.JWT_ACCESS_TTL);
  }

  private refreshTtlMs(): number {
    return parseDurationSeconds(this.env.JWT_REFRESH_TTL) * 1000;
  }
}
