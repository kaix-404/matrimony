import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClockService } from '../common/clock/clock.service';
import { PrismaClient } from '../prisma/prisma-client';
import type { Env } from '../config/env';
import type { AccessTokenClaims } from '@matrimony/shared';

/** Refresh token lifetime, in seconds. */
const REFRESH_TOKEN_BYTES = 32;

/**
 * Access and refresh token issuance.
 *
 * SECTION 41 DESIGN: "Use short-lived access tokens and rotating refresh
 * tokens." The two halves do different jobs and this class is where that
 * difference lives:
 *
 *   access  — a signed JWT, stateless, 15 minutes. Verified on every request
 *             without a database round trip.
 *   refresh — an opaque random string. Not a JWT at all: if it were, it would
 *             be replayable until expiry, because the server could not know
 *             whether it had already been used.
 *
 * Rotation is what makes a stolen refresh token detectable. Every refresh mints
 * a new token and revokes its predecessor, so an attacker who copies one and
 * uses it after the real client has refreshed is caught by the reuse check and
 * the entire family is revoked. Without rotation a stolen token stays valid for
 * its full 30 days and its use is indistinguishable from the owner's.
 */
@Injectable()
export class TokenService {
  private readonly env: Env;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
    private readonly jwt: JwtService,
    @Inject('ENV') env: Env,
  ) {
    this.env = env;
  }

  /**
   * Issues an access token for a user.
   *
   * The account status is embedded so the app can decide navigation without a
   * second request, but it is re-read on every refresh — a status baked into a
   * 15-minute token is a suspended user who can still act on it for up to 15
   * minutes, and for a suspended account that window is not acceptable.
   */
  async issueAccessToken(user: {
    id: string;
    status: string;
    networthCategory: string;
  }): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      typ: 'access',
      status: user.status,
      cat: user.networthCategory,
    });
  }

  /** Verifies an access token and returns its claims, or null if unusable. */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
      // A refresh token must never be accepted here. `typ` is checked rather
      // than assumed because the two are signed with different secrets already;
      // this is the belt to that braces.
      return claims.typ === 'access' ? claims : null;
    } catch {
      return null;
    }
  }

  /**
   * Issues a refresh token, optionally continuing an existing family.
   *
   * `familyId` is what ties a rotation chain together. A fresh login starts a
   * new family; a refresh passes the current family forward.
   */
  async issueRefreshToken(
    userId: string,
    options: {
      familyId?: string;
      deviceId?: string;
      ip?: string;
      userAgent?: string;
    } = {},
  ): Promise<{ token: string; familyId: string; expiresAt: Date }> {
    const familyId = options.familyId ?? randomBytes(16).toString('hex');
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(this.clock.now().getTime() + this.refreshTtlMs());

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        familyId,
        deviceId: options.deviceId ?? null,
        ipHash: options.ip ? this.hashToken(options.ip) : null,
        userAgent: options.userAgent ?? null,
        expiresAt,
      },
    });

    return { token, familyId, expiresAt };
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * Returns null when the token is unknown, expired, already revoked, or
   * replayed. The replay branch is the important one: presenting a token that
   * was already rotated means either the real client or a thief has it, and
   * there is no way to tell which. Revoking the family is the safe reading —
   * the legitimate user simply logs in again.
   */
  async rotate(
    presentedToken: string,
    context: { deviceId?: string; ip?: string; userAgent?: string } = {},
  ): Promise<{
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    familyId: string;
  } | null> {
    const tokenHash = this.hashToken(presentedToken);
    const now = this.clock.now();

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            status: true,
            networthCategory: true,
            deletedAt: true,
            isAnonymised: true,
          },
        },
      },
    });

    if (!existing) {
      return null;
    }

    if (existing.revokedAt) {
      // Replay of an already-rotated token: compromise the whole chain.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'REUSE_DETECTED' },
      });
      return null;
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: now, revokedReason: 'EXPIRED' },
      });
      return null;
    }

    // A token belonging to a deleted, anonymised or suspended account must not
    // keep working: erasure means the account is gone rather than hidden, and a
    // suspension has to bite at once. Refresh is the only endpoint that would
    // otherwise keep handing out access tokens past a suspension, since the
    // access token itself outlives the decision by its short TTL.
    if (
      existing.user.deletedAt ||
      existing.user.isAnonymised ||
      existing.user.status === 'DELETED' ||
      existing.user.status === 'SUSPENDED'
    ) {
      return null;
    }

    // Rotate atomically. The `revokedAt: null` in the predicate makes this safe
    // against two concurrent refreshes with the same token: exactly one update
    // can match, so the loser falls through to the reuse branch.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'ROTATED' },
    });

    if (revoked.count === 0) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'REUSE_DETECTED' },
      });
      return null;
    }

    const next = await this.issueRefreshToken(existing.userId, {
      familyId: existing.familyId,
      deviceId: context.deviceId,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      userId: existing.userId,
      accessToken: await this.issueAccessToken(existing.user),
      refreshToken: next.token,
      expiresIn: Math.floor(this.accessTtlSeconds()),
      familyId: existing.familyId,
    };
  }

  /**
   * Revokes a single token. Used by logout.
   *
   * Only the presented token is revoked, not the family: logging out on one
   * device should not silently sign the user out everywhere, which is what
   * family-wide revocation here would do.
   */
  async revoke(presentedToken: string, reason = 'LOGOUT'): Promise<boolean> {
    const now = this.clock.now();
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(presentedToken), revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    return result.count > 0;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Access token lifetime in seconds. */
  accessTtlSeconds(): number {
    return parseDurationSeconds(this.env.JWT_ACCESS_TTL);
  }

  private refreshTtlMs(): number {
    return parseDurationSeconds(this.env.JWT_REFRESH_TTL) * 1000;
  }
}

/**
 * Parses a duration like `15m`, `30d` or `900s` into seconds.
 *
 * Exported because the JWT module needs the same number the token service will
 * report in `expires_in`. If the two parsed it separately — or one hardcoded
 * 900 while the other read the environment — the client would be told its token
 * lasts longer or shorter than it does, and would refresh at the wrong moment.
 */
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported duration "${value}"; expected forms like 15m, 30d, 900s`);
  }
  const multiplier = { s: 1, m: 60, h: 3600, d: 86_400 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return Number(match[1]) * multiplier;
}
