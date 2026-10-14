import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { NOTIFICATION_EVENTS } from '@matrimony/shared';
import { ClockService } from '../common/clock/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UnlockService } from './unlock.service';
import type { Env } from '../config/env';

/**
 * Section 15 / C3: remind a buyer shortly before an unlock lapses.
 *
 * The client asked for the nudge two hours out, which is why the lead time is
 * configuration (`UNLOCK_EXPIRY_REMINDER_HOURS`) rather than a literal here: the
 * spec named it, so it should be changeable without a code change, and a test
 * can pin it.
 *
 * Why a timer and not a cron: same reasoning as `UnlockExpirySweeper` and
 * `ClockDriftGuard`. It needs no new dependency and it must not be able to take
 * the process down, so every failure is caught and logged. `unref()` keeps a
 * pending sweep from holding the process open on shutdown.
 *
 * The row is claimed (stamped) by `UnlockService.claimDueReminders` before the
 * notification is written, so the idempotency lives with the data, not with
 * this timer's uptime. A restart mid-window therefore cannot double-notify.
 */
@Injectable()
export class UnlockExpiryReminder implements OnApplicationBootstrap, OnModuleDestroy {
  private static readonly SWEEP_INTERVAL_MS = 5 * 60_000;
  private readonly logger = new Logger(UnlockExpiryReminder.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly unlocks: UnlockService,
    private readonly notifications: NotificationsService,
    private readonly clock: ClockService,
    @Inject('ENV') private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    // `void` rather than returning the promise: `setInterval` ignores the return
    // value, and handing it a promise is exactly the shape that lets a rejection
    // escape as an unhandled rejection.
    this.timer = setInterval(() => {
      void this.safeSweep();
    }, UnlockExpiryReminder.SWEEP_INTERVAL_MS);
    this.timer.unref();
    // Sweep once at boot so a deployment that was down across a reminder window
    // still notifies, provided the window has not yet lapsed.
    void this.safeSweep();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Claim every unlock now inside the reminder window and record one
   * notification per claim. Returns how many were reminded.
   *
   * IN_APP rather than PUSH: no push transport is wired, and the in-app list is
   * the surface a user actually sees, so recording it there is honest. A push
   * provider added later can read the same rows.
   */
  async sweep(): Promise<number> {
    const hours = this.env.UNLOCK_EXPIRY_REMINDER_HOURS;
    const due = await this.unlocks.claimDueReminders(hours * 60 * 60 * 1000, this.clock.now());

    for (const item of due) {
      await this.notifications.create({
        userId: item.userId,
        event: NOTIFICATION_EVENTS.UNLOCK_EXPIRING_IN_2H,
        channel: 'IN_APP',
        title: 'Your unlock is about to expire',
        body: this.body(item.displayName, hours),
        payload: {
          unlock_id: item.unlockId,
          profile_id: item.profileId,
          unlock_expires_at: item.unlockExpiresAt.toISOString(),
        },
      });
    }

    if (due.length > 0) {
      this.logger.log(`Recorded ${due.length} unlock expiry reminder(s).`);
    }
    return due.length;
  }

  private body(name: string | null, hours: number): string {
    const who = name ?? 'a profile you unlocked';
    return `Your access to ${who} expires in about ${hours} hours. Unlock it again to keep the contact details.`;
  }

  private async safeSweep(): Promise<void> {
    try {
      await this.sweep();
    } catch (error) {
      this.logger.error(
        'Unlock expiry reminder sweep failed; will retry on the next interval.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
