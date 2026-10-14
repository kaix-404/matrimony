import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';
import { ClockService } from '../common/clock/clock.service';
import { PushGateway } from '../push/push.gateway';
import { NotificationsService } from './notifications.service';

/**
 * Delivers `PUSH` notifications (section 42, Firebase).
 *
 * At-least-once, never twice-per-worker: a notification is claimed by flipping
 * `PENDING` -> `SENDING` with a conditional update, so two dispatchers — or two
 * API instances — cannot both send the same row. A row left `SENDING` by a
 * crashed worker is requeued once it goes stale.
 *
 * Only notifications whose recipient has at least one registered device are
 * picked up. A push for a user with no device is not an error worth recording:
 * it simply waits in `PENDING`, and is delivered if that user registers a device
 * before it is superseded. This also means a `PUSH` row is still visible in the
 * member's in-app list meanwhile, since that list is not filtered by channel.
 */
@Injectable()
export class PushDispatchService {
  /** A `SENDING` row older than this is assumed abandoned and requeued. */
  private static readonly STALE_MS = 5 * 60_000;
  /** After this many failed attempts a row stops being retried. */
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly DEFAULT_BATCH = 50;

  private readonly logger = new Logger(PushDispatchService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly push: PushGateway,
    private readonly notifications: NotificationsService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Send one batch of due push notifications. Returns how many were delivered.
   * A no-op (and zero) when FCM is unconfigured, so the sweeper stays silent.
   */
  async dispatch(batch: number = PushDispatchService.DEFAULT_BATCH): Promise<number> {
    if (!this.push.configured) return 0;

    await this.requeueStale();

    const due = await this.prisma.notification.findMany({
      where: {
        channel: 'PUSH',
        status: 'PENDING',
        attempts: { lt: PushDispatchService.MAX_ATTEMPTS },
        // Relation filter: the recipient must actually have a device. Narrows
        // the batch so an install-less waitlist cannot starve real sends.
        user: { deviceTokens: { some: {} } },
      },
      orderBy: { createdAt: 'asc' },
      take: batch,
      select: {
        id: true,
        userId: true,
        title: true,
        body: true,
        event: true,
        payload: true,
      },
    });

    let delivered = 0;
    for (const notification of due) {
      const claimed = await this.prisma.notification.updateMany({
        where: { id: notification.id, status: 'PENDING' },
        data: { status: 'SENDING' },
      });
      // Someone else claimed it between the read and here.
      if (claimed.count !== 1) continue;
      if (await this.deliver(notification)) delivered += 1;
    }

    if (delivered > 0) {
      this.logger.log(`Delivered ${delivered} push notification(s).`);
    }
    return delivered;
  }

  private async deliver(notification: {
    id: string;
    userId: string | null;
    title: string;
    body: string;
    event: string;
    payload: unknown;
  }): Promise<boolean> {
    const tokens = notification.userId
      ? await this.prisma.deviceToken.findMany({
          where: { userId: notification.userId },
          select: { id: true, token: true },
        })
      : [];

    if (tokens.length === 0) {
      // Claimed, then the last device was unregistered before we sent.
      await this.notifications.markSuppressed(notification.id, 'no registered devices');
      return false;
    }

    const data = toData(notification.event, notification.payload);
    const errors: string[] = [];
    let providerMessageId: string | null = null;
    let sent = false;

    for (const token of tokens) {
      try {
        const result = await this.push.send({
          token: token.token,
          title: notification.title,
          body: notification.body,
          data,
        });
        if (result.invalidToken) {
          // FCM says this device is gone; prune it so it is not retried.
          await this.prisma.deviceToken.deleteMany({ where: { id: token.id } });
          continue;
        }
        sent = true;
        providerMessageId ??= result.providerMessageId;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (sent) {
      // Best effort across a user's devices: one delivery is a delivered
      // notification, and a device that failed is left to the next event.
      await this.notifications.markSent(notification.id, providerMessageId ?? undefined);
      return true;
    }

    await this.notifications.markFailed(
      notification.id,
      errors[0] ?? 'all device tokens are unregistered',
    );
    return false;
  }

  private async requeueStale(): Promise<void> {
    const staleBefore = new Date(this.clock.nowMs() - PushDispatchService.STALE_MS);
    await this.prisma.notification.updateMany({
      where: { channel: 'PUSH', status: 'SENDING', updatedAt: { lt: staleBefore } },
      data: { status: 'PENDING' },
    });
  }
}

/**
 * FCM's `data` payload is a flat map of strings. The notification's stored
 * payload is JSON, so it is flattened with a JSON stringify for non-strings and
 * a stable `event` key the app can switch on.
 */
export function toData(event: string, payload: unknown): Record<string, string> {
  const data: Record<string, string> = { event };
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (key === 'event') continue;
      data[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  } else if (payload !== undefined) {
    data['payload'] = JSON.stringify(payload);
  }
  return data;
}
