import { Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AccountDeletionResult } from '@matrimony/shared';
import { Prisma, PrismaClient, UserStatus } from '../prisma/prisma-client';
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
  private readonly logger = new Logger(AccountDeletionService.name);

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

  /**
   * Section 21, second half: erase the PII of accounts whose retention window
   * has closed.
   *
   * `deleteAccount` only *becomes* deleted and sets `purgeAfter`; without this
   * pass the deadline is a column nothing reads, and "retention-then-anonymise"
   * stops at retention. The window is deliberate — client answer F6 keeps the
   * row recoverable for a few months in case a deletion was a mistake — so this
   * only touches a row once `purgeAfter <= now`.
   *
   * What is erased is the person: the mobile (the sole login identifier) and
   * email are replaced with a per-account tombstone, and the profile's prose and
   * demographics are blanked. What is kept is the accounting: section 21 says
   * payment records are retained, so `Payment` and `ContactUnlock` are never
   * touched, and their foreign keys survive because the `User`/`Profile` rows
   * themselves survive — anonymised, not deleted.
   *
   * The mobile is overwritten with a deterministic tombstone rather than
   * `NULL`: the column is `@unique` and `NOT NULL`, and a freed-up real number
   * must be able to register again — the tombstone is what lets the same mobile
   * return as a fresh account while the erased row keeps a stable, non-PII value.
   *
   * Idempotent by construction: the `where` only matches `isAnonymised: false`,
   * so a second sweep, a concurrent instance or a redeploy finds nothing to do
   * for a row already erased.
   */
  async purgeDue(now: Date = this.clock.now()): Promise<number> {
    const due = await this.prisma.user.findMany({
      where: { purgeAfter: { lte: now }, isAnonymised: false },
      select: { id: true, profile: { select: { id: true } } },
    });

    let purged = 0;
    for (const account of due) {
      const tombstoneMobile = `purged:${account.id}`;
      const ops: unknown[] = [
        this.prisma.user.update({
          where: { id: account.id },
          data: {
            mobile: tombstoneMobile,
            email: null,
            isAnonymised: true,
            // The lockout and login counters describe attempts against a
            // mobile that no longer belongs to this row.
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: null,
          },
        }),
      ];

      if (account.profile) {
        // Photos and interests are links to a person, not a payment; the photos
        // also hold object keys whose bytes the storage lifecycle expires.
        ops.push(
          this.prisma.profilePhoto.deleteMany({ where: { profileId: account.profile.id } }),
          this.prisma.profileInterest.deleteMany({ where: { profileId: account.profile.id } }),
          this.prisma.profile.update({
            where: { id: account.profile.id },
            data: {
              firstName: 'Deleted',
              lastName: null,
              timeOfBirth: null,
              placeOfBirth: null,
              heightCm: null,
              religion: null,
              communityId: null,
              motherTongue: null,
              swagotra: null,
              maternalGothra: null,
              rashi: null,
              nakshatra: null,
              gan: null,
              manglikStatus: null,
              educationId: null,
              professionId: null,
              company: null,
              annualIncome: null,
              workLocation: null,
              fathersOccupation: null,
              mothersOccupation: null,
              siblings: null,
              familyLocation: null,
              familyDescription: null,
              foodPreference: null,
              smoking: null,
              drinking: null,
              aboutMe: null,
              attributes: Prisma.DbNull,
              country: null,
              state: null,
              city: null,
            },
          }),
        );
      }

      await this.prisma.$transaction(ops as never);
      purged += 1;
    }

    if (purged > 0) {
      this.logger.log(`Anonymised ${purged} account(s) past their retention window.`);
    }
    return purged;
  }
}
