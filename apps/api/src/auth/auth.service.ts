import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClockService } from '../common/clock/clock.service';
import { PrismaClient, UserStatus } from '../prisma/prisma-client';
import { TokenService } from './token.service';
import type { TokenPair } from '@matrimony/shared';

/** Failed verifications tolerated before the account is locked. */
const MAX_FAILED_LOGINS = 5;
/** Lockout duration once that count is reached. */
const LOCKOUT_MINUTES = 15;

/**
 * Sign-in, and the account lockout around it.
 *
 * Login here is "verified a code we sent to this number", so the interesting
 * failure is not a wrong password — there are none — it is a brute-force loop
 * against the OTP endpoint. The per-request attempt ceiling in `OtpService` caps
 * how often one code can be guessed; this caps how many codes can be burned
 * against one account before it stops responding, and writes `lockedUntil` from
 * server time so a client clock cannot clear it.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Issues tokens for a mobile number, or throws if the account cannot sign in.
   *
   * Returns null rather than throwing when the number simply has no account:
   * the caller has already proved possession of the number via OTP, so
   * "unknown number" is not sensitive to that caller, and telling them lets the
   * app route to registration.
   */
  async signIn(mobile: string): Promise<TokenPair | null> {
    const user = await this.prisma.user.findUnique({
      where: { mobile },
      select: {
        id: true,
        status: true,
        networthCategory: true,
        failedLoginCount: true,
        lockedUntil: true,
        deletedAt: true,
        isAnonymised: true,
      },
    });

    if (!user || user.deletedAt || user.isAnonymised || user.status === UserStatus.DELETED) {
      return null;
    }

    const now = this.clock.now();

    if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
      throw new UnauthorizedException('Account temporarily locked. Try again later.');
    }

    // A suspended or deleted account must not receive tokens even though the
    // number is theirs. Silently succeeding here would leave a suspended user
    // with a valid session and no indication why nothing works.
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is suspended');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now, failedLoginCount: 0, lockedUntil: null },
    });

    const refresh = await this.tokens.issueRefreshToken(user.id);

    return {
      access_token: await this.tokens.issueAccessToken(user),
      refresh_token: refresh.token,
      token_type: 'Bearer',
      expires_in: this.tokens.accessTtlSeconds(),
    };
  }

  /**
   * Records a failed sign-in attempt and locks the account at the threshold.
   *
   * The increment and the threshold check happen in one conditional update, so
   * two concurrent failures both at the limit cannot both read `count = 4` and
   * conclude the next one would not matter.
   */
  async recordFailedSignIn(userId: string): Promise<void> {
    const now = this.clock.now();
    const updated = await this.prisma.user.updateMany({
      where: {
        id: userId,
        failedLoginCount: { lt: MAX_FAILED_LOGINS },
      },
      data: { failedLoginCount: { increment: 1 } },
    });

    if (updated.count === 0) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginCount: true },
    });

    if (user && user.failedLoginCount >= MAX_FAILED_LOGINS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) },
      });
    }
  }
}
