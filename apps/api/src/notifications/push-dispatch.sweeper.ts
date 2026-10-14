import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PushDispatchService } from './push-dispatch.service';

/**
 * Periodically delivers queued push notifications.
 *
 * Same shape as `UnlockExpirySweeper`: a timer rather than a cron dependency,
 * firing once at boot and then on an interval, with every failure caught and
 * logged so a background callback can never become an uncaught exception that
 * kills the process. `unref()` so a pending sweep does not hold the process open
 * on shutdown.
 *
 * A short interval relative to the others because a push is the notification
 * channel with the least tolerance for delay.
 */
@Injectable()
export class PushDispatchSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private static readonly SWEEP_INTERVAL_MS = 60_000;
  private readonly logger = new Logger(PushDispatchSweeper.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly dispatch: PushDispatchService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.safeSweep();
    }, PushDispatchSweeper.SWEEP_INTERVAL_MS);
    this.timer.unref();
    void this.safeSweep();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async safeSweep(): Promise<void> {
    try {
      await this.dispatch.dispatch();
    } catch (error) {
      this.logger.error(
        'Push dispatch sweep failed; will retry on the next interval.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
