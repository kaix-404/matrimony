import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClockService } from '../common/clock/clock.service';
import { PrismaClient, UserStatus } from '../prisma/prisma-client';
import { OtpService } from './otp.service';
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
    private readonly otp: OtpService,
  ) {}

  /**
   * Moves the account to a new mobile number.
   *
   * Two proofs are required and they are different proofs: the bearer token says
   * the caller is signed in as this account, and the code says they can receive
   * SMS on the new number. Either alone would be enough to take over an account
   * — a stolen phone, or a stolen session.
   *
   * The number is the login identity, so every session minted against the old
   * number is revoked. The device that made the change is handed a fresh pair, so
   * it stays signed in and the other devices do not.
   */
  async changeMobile(userId: string, mobile: string, code: string): Promise<TokenPair> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mobile: true, deletedAt: true, isAnonymised: true },
    });

    if (current.deletedAt !== null || current.isAnonymised) {
      throw new UnauthorizedException('This account can no longer be changed');
    }

    if (current.mobile === mobile) {
      throw new BadRequestException('That is already your mobile number');
    }

    // Verified first, so an expired or guessed code answers the same way as a
    // taken number would not: the caller learns nothing until they hold the
    // number.
    const verified = await this.otp.verify({ mobile, purpose: 'CHANGE_MOBILE', code });
    if (verified === null) {
      throw new UnauthorizedException('That code is not valid for this number');
    }

    const owner = await this.prisma.user.findUnique({ where: { mobile }, select: { id: true } });
    if (owner !== null) {
      // Told plainly: the caller has just proved they control the number, which is
      // the same proof registration relies on before it reveals this.
      throw new ConflictException('That mobile number is already registered');
    }

    // Spent only once everything that can refuse the change has passed, so a
    // refused attempt does not burn the member's code.
    await this.otp.consumeVerified({ mobile, purpose: 'CHANGE_MOBILE' });

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mobile, isPhoneVerified: true },
      });
    } catch {
      // The unique index is the real arbiter: two accounts changing to the same
      // number at the same moment both pass the check above.
      throw new ConflictException('That mobile number is already registered');
    }

    await this.tokens.revokeAllForUser(userId, 'MOBILE_CHANGED');

    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, status: true, networthCategory: true },
    });
    const refresh = await this.tokens.issueRefreshToken(userId);

    return {
      access_token: await this.tokens.issueAccessToken(account),
      refresh_token: refresh.token,
      token_type: 'Bearer',
      expires_in: this.tokens.accessTtlSeconds(),
    };
  }

  /**
   * Issues tokens for a mobile number, or throws if the account cannot sign in.
   *
   * Returns null rather than throwing when the number simply has no account:
   * the caller has already proved possession of the number via OTP, so
   * "unknown number" is not sensitive to that caller, and telling them lets the
   * app route to registration.
   */
  /**
   * Adds an email address to the account, or moves it to a different one.
   *
   * The proof is a code sent to the address, so this establishes that the member
   * can receive mail there; the bearer token establishes that it is their
   * account. Unlike a number change this revokes nothing: the email is not a
   * login identity in this product, and losing a mailbox must not sign somebody
   * out of the app they are already using.
   *
   * The code is bound to the exact address it was issued for, so a code obtained
   * for one mailbox cannot be spent on another.
   */
  async changeEmail(userId: string, email: string, code: string): Promise<void> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mobile: true, email: true, deletedAt: true, isAnonymised: true },
    });

    if (current.deletedAt !== null || current.isAnonymised) {
      throw new UnauthorizedException('This account can no longer be changed');
    }

    if (current.email === email) {
      throw new BadRequestException('That is already your email address');
    }

    // Verified before the uniqueness check so an expired or guessed code cannot
    // be used to probe which addresses are registered.
    const verified = await this.otp.verify({
      mobile: current.mobile,
      purpose: 'CHANGE_EMAIL',
      email,
      code,
    });
    if (verified === null) {
      throw new UnauthorizedException('That code is not valid for this address');
    }

    const owner = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (owner !== null && owner.id !== userId) {
      // Told plainly: the caller has just proved they can receive mail at the
      // address, which registration would reveal anyway.
      throw new ConflictException('That email address is already registered');
    }

    // Spent only once everything that can refuse the change has passed, so a
    // refused attempt does not burn the member's code.
    await this.otp.consumeVerified({
      mobile: current.mobile,
      purpose: 'CHANGE_EMAIL',
      email,
    });

    try {
      await this.prisma.user.update({ where: { id: userId }, data: { email } });
    } catch {
      // The unique index is the real arbiter: two accounts claiming the same
      // address at the same moment both pass the check above.
      throw new ConflictException('That email address is already registered');
    }
  }

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
   * Looks up an account by number and records a failure against it if there is
   * one.
   *
   * The lockout is keyed on a user id, but the only thing the OTP verify step
   * holds is a mobile number, so this is the bridge. A number with no account
   * is a silent no-op for the reason given on the caller: failing loudly, or
   * creating a placeholder row to count against, would turn the lockout into an
   * unauthenticated way to block someone else's number from registering.
   */
  async recordFailedSignInForMobile(mobile: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { mobile },
      select: { id: true },
    });

    if (user) {
      await this.recordFailedSignIn(user.id);
    }
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
