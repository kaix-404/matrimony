import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';

/**
 * Periodically erases the PII of accounts whose retention window has closed.
 *
 * `deleteAccount` sets `purgeAfter`; nothing else reads it, so without this
 * sweep the section 21 retention deadline is a column that only ever gets
 * written. The interval is long because the deadline is months out — a row that
 * becomes due is not time-sensitive to the minute, and a tighter loop would only
 * scan a table that changes once per deleted account.
 *
 * A timer, not a cron dependency, for the same reason `UnlockExpirySweeper` and
 * `ClockDriftGuard` use one: it needs no new package and must not be able to take
 * the process down. An exception thrown inside a `setInterval` callback is an
 * uncaught exception that kills an otherwise healthy server, so every failure is
 * caught and logged.
 *
 * `unref()` so a pending sweep never holds the process open during shutdown.
 */
@Injectable()
export class AccountRetentionSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  // Six hours: the work is bulk erasure of a handful of rows a day, and the
  // earliest a missed sweep matters is a day of retention overrun on an account
  // that is already invisible.
  private static readonly SWEEP_INTERVAL_MS = 6 * 60 * 60_000;
  private readonly logger = new Logger(AccountRetentionSweeper.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deletions: AccountDeletionService) {}

  onApplicationBootstrap(): void {
    // `void` rather than returning the promise: `setInterval` ignores the return
    // value, and handing it a promise is exactly the shape that lets a rejection
    // escape as an unhandled rejection.
    this.timer = setInterval(() => {
      void this.safeSweep();
    }, AccountRetentionSweeper.SWEEP_INTERVAL_MS);
    this.timer.unref();
    // Sweep once at boot so a deployment that was down across a purge deadline
    // does not leave an overdue account waiting a full interval.
    void this.safeSweep();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async safeSweep(): Promise<void> {
    try {
      await this.deletions.purgeDue();
    } catch (error) {
      this.logger.error(
        'Account retention sweep failed; will retry on the next interval.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
