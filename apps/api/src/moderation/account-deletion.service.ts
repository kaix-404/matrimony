import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AccountDeletionResult } from '@matrimony/shared';
import { PrismaClient, UserStatus } from '../prisma/prisma-client';
import { ClockService } from '../common/clock/clock.service';
import { OtpService } from '../auth/otp.service';
import type { Env } from '../config/env';

/**
 * Adds whole calendar months, clamping the day so the deadline never lands
 * short — 31 January plus one month has to be 28/29 February, not 3 March,
 * because a retention period that quietly lengthens is a retention period the
 * client answer F6 does not describe.
 */
function addMonths(from: Date, months: number): Date {
  const target = new Date(from.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/**
 * Section 21 — Settings → Delete Account.
 *
 * Everything the read side needs already exists and is already enforced:
 * discovery filters on `deletedAt`/`isAnonymised`/`status`, refresh refuses a
 * token for a deleted account (`token.service.ts`), contact is withheld for a
 * deleted owner, and block/report answer 404 through `isLiveProfile`. So the
 * whole of this endpoint is *becoming* deleted — the row changes, and the rest
 * of the system notices on the next request with nothing to invalidate.
 *
 * The deletion is soft. `purgeAfter` sets the retention deadline (client answer
 * F6, `DELETED_ACCOUNT_RETENTION_MONTHS`), after which the record is
 * irreversibly erased. Nothing here removes a `Payment` or a `ContactUnlock`:
 * section 21 says payment records are kept, and an erasure that took the
 * accounting with it would break reconciliation for a legal obligation the app
 * does not have.
 *
 * Re-authentication is a `DELETE_ACCOUNT` OTP, bound by mobile. The number is
 * read from the caller's own row rather than taken from the request, so the
 * code has to have been issued for the account that is asking — a code the
 * attacker holds for their own number is worthless here.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly otp: OtpService,
    private readonly clock: ClockService,
    @Inject('ENV') private readonly env: Env,
  ) {}

  async deleteAccount(userId: string): Promise<AccountDeletionResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mobile: true, deletedAt: true, purgeAfter: true },
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    // Checked before the OTP, not after. A retry landing after the first
    // request succeeded has already spent its code, so requiring one here would
    // turn a recovered connection into a 401 against an account that is already
    // deleted — the caller would be told their own deletion failed.
    if (user.deletedAt) {
      return { deleted: true, purge_after: (user.purgeAfter ?? user.deletedAt).toISOString() };
    }

    // An atomic claim: verified, not yet spent, not expired. Exactly one of two
    // concurrent deletions can match the row, so the loser is refused rather
    // than both proceeding on the same code.
    const consumed = await this.otp.consumeVerified({
      mobile: user.mobile,
      purpose: 'DELETE_ACCOUNT',
    });

    if (!consumed) {
      throw new UnauthorizedException('Verify your mobile number before deleting your account');
    }

    const now = this.clock.now();
    const purgeAfter = addMonths(now, this.env.DELETED_ACCOUNT_RETENTION_MONTHS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          deletionRequestedAt: now,
          purgeAfter,
          status: UserStatus.DELETED,
          // The lockout is meaningless once the account cannot sign in, and
          // leaving it set would be a stale record on a row that no longer
          // accepts logins for its own reason.
          lockedUntil: null,
          failedLoginCount: 0,
        },
      }),
      // The profile is marked too, not just the owner. `isLiveProfile` asks
      // about the profile first, and block and report both filter the blocked
      // list on `profile.deletedAt`; updating only the user would leave those
      // two disagreeing about whether the row still identifies someone.
      this.prisma.profile.updateMany({ where: { userId }, data: { deletedAt: now } }),
      // Sessions die with the account rather than at their own expiry. Refresh
      // would already refuse them, but a live family left behind is a row that
      // keeps a stolen token retryable until it notices.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'ACCOUNT_DELETED' },
      }),
    ]);

    return { deleted: true, purge_after: purgeAfter.toISOString() };
  }
}
