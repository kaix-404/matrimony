import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AdminTokenPair } from '@matrimony/shared';
import { AdminTokenService } from './admin-token.service';
import { ClockService } from '../common/clock/clock.service';
import { PrismaClient, UserStatus, type AdminRoleSlug } from '../prisma/prisma-client';
import { hashPassword, verifyPassword } from '../common/crypto/password';
import { parseDurationSeconds } from '../auth/token.service';
import type { Env } from '../config/env';

/** Failed verifications tolerated before an admin account is locked. */
const MAX_FAILED_LOGINS = 5;
/** Lockout duration once that count is reached. */
const LOCKOUT_MINUTES = 15;
const REFRESH_TOKEN_BYTES = 32;

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

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
    private readonly tokens: AdminTokenService,
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
  async login(input: { email: string; password: string }): Promise<AdminTokenPair> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        status: true,
        passwordHash: true,
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

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: now, failedLoginCount: 0, lockedUntil: null },
    });

    return this.issuePair(admin.id, admin.roles.map((assignment) => assignment.role.slug));
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
