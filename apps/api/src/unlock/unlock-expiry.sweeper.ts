import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { UnlockService } from './unlock.service';

/**
 * Periodically marks unlocks whose window has closed.
 *
 * This is bookkeeping, not enforcement. `UnlockService.view` already refuses
 * contact when `isUnlockActive` says the window has passed, with no help from the
 * database, so an un-swept row cannot leak anything to a buyer. What it would
 * cost is a stale `ACTIVE` status for the buyer's own list and for reconciliation
 * with the gateway — the sort of drift that turns into "support says my unlock
 * expired but the app says it is active".
 *
 * A timer, not a cron dependency, for the same reason `ClockDriftGuard` uses one:
 * it needs no new package and must not be able to take the process down. An
 * exception thrown inside a `setInterval` callback is an uncaught exception that
 * kills an otherwise healthy server, so every failure here is caught and logged.
 *
 * `unref()` so a pending sweep never holds the process open during shutdown.
 */
@Injectable()
export class UnlockExpirySweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private static readonly SWEEP_INTERVAL_MS = 5 * 60_000;
  private readonly logger = new Logger(UnlockExpirySweeper.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly unlocks: UnlockService) {}

  onApplicationBootstrap(): void {
    // `void` rather than returning the promise: `setInterval` ignores the return
    // value, and handing it a promise is exactly the shape that lets a rejection
    // escape as an unhandled rejection.
    this.timer = setInterval(() => {
      void this.safeSweep();
    }, UnlockExpirySweeper.SWEEP_INTERVAL_MS);
    this.timer.unref();
    // Sweep once at boot so a deployment that was down across an expiry boundary
    // does not serve stale statuses until the first interval elapses.
    void this.safeSweep();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async safeSweep(): Promise<void> {
    try {
      await this.unlocks.expireDue();
    } catch (error) {
      this.logger.error(
        'Unlock expiry sweep failed; will retry on the next interval.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
