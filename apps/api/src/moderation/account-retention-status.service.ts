import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';
import { ClockService } from '../common/clock/clock.service';
import { ACCOUNT_RETENTION_OVERDUE_AFTER_MS } from './account-retention.constants';

/** The section 21 erasure deadline, as the health report reads it. */
export interface AccountRetentionReport {
  /** Accounts past `purgeAfter` that are not anonymised: the whole overdue set. */
  due: number;
  /**
   * Soft-deleted accounts with no deadline at all.
   *
   * The sweep erases these by their own deletion date, so they are no longer a
   * silent hole — but without this count, spotting one meant running the SQL by
   * hand, and a count that climbs means some writer is creating deletions
   * without a deadline. Kept apart from `due`, which is about lateness and needs
   * a deadline to be late for.
   */
  undated: number;
  /** When the oldest of those became due, or null when none is waiting. */
  oldestDueAt: string | null;
  oldestOverdueSeconds: number | null;
  /** True when the oldest is more than two sweep intervals past its deadline. */
  overdue: boolean;
}

/**
 * Measures the anonymisation queue from outside the sweeper.
 *
 * `deleteAccount` only writes `purgeAfter`; the six-hourly sweep is the only
 * thing that reads it, so if that timer stops nothing happens, nothing fails and
 * nobody is told — the retention deadline simply passes. This asks the data
 * directly, which is both the evidence a stopped timer cannot fake and the
 * number an audit asks for: how many accounts are past their purge date, and how
 * far past the oldest one is.
 *
 * Reads by `(isAnonymised, purgeAfter)` — the index added with this check — so a
 * poll costs an index scan of the overdue rows rather than a scan of `User`.
 * Depends on the client and the clock only, so the health module can report this
 * without importing the moderation graph (OTP, auth).
 */
@Injectable()
export class AccountRetentionStatusService {
  private readonly logger = new Logger(AccountRetentionStatusService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
  ) {}

  /**
   * The queue as of now, or null when it could not be read.
   *
   * Null rather than an empty queue: "could not ask" must not read as "nothing
   * overdue", which is the one answer that would hide a missed deadline.
   */
  async measure(): Promise<AccountRetentionReport | null> {
    const now = this.clock.now();
    try {
      const [result, undated] = await Promise.all([
        this.prisma.user.aggregate({
          where: { isAnonymised: false, purgeAfter: { lte: now } },
          _count: { _all: true },
          _min: { purgeAfter: true },
        }),
        // The other half of the queue: deleted rows the sweep only reaches
        // through its `deletedAt` fallback. The same index answers it, since
        // `isAnonymised = false AND purgeAfter IS NULL` is its prefix.
        this.prisma.user.count({
          where: { isAnonymised: false, purgeAfter: null, deletedAt: { not: null } },
        }),
      ]);

      // The oldest deadline is the most overdue account, not the oldest account:
      // the wait to report is measured from when the purge was owed.
      const oldest = result._min.purgeAfter;
      const oldestMs = oldest === null ? null : new Date(oldest).getTime();
      const overdueMs = oldestMs === null ? null : Math.max(0, now.getTime() - oldestMs);

      return {
        due: result._count._all,
        undated,
        oldestDueAt: oldestMs === null ? null : new Date(oldestMs).toISOString(),
        oldestOverdueSeconds: overdueMs === null ? null : Math.floor(overdueMs / 1000),
        overdue: overdueMs !== null && overdueMs > ACCOUNT_RETENTION_OVERDUE_AFTER_MS,
      };
    } catch (error) {
      const code = (error as Error & { code?: string })?.code ?? '';
      this.logger.error(
        `Could not read the retention queue for readiness.${code ? ` [${code}]` : ''}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
