import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';
import { ClockService } from '../common/clock/clock.service';
import {
  PUSH_BACKLOG_STALE_AFTER_MS,
  PUSH_MAX_ATTEMPTS,
  PUSH_SENDING_STALE_MS,
} from './push-dispatch.constants';

/** One row per status present in the queue. */
interface QueueCountRow {
  status: string;
  count: bigint;
  oldest: Date | null;
}

/** How long the push queue has been waiting, as the health report reads it. */
export interface PushBacklog {
  /** Pushes a running dispatcher would send now: pending, retries left, a device to send to. */
  due: number;
  /** Rows a dispatcher claimed and never finished; a running one requeues these. */
  abandoned: number;
  /** When the oldest of those was created, or null when nothing is waiting. */
  oldestAt: string | null;
  oldestAgeSeconds: number | null;
  /** True when the oldest has waited longer than a running dispatcher would allow. */
  overdue: boolean;
}

/**
 * Measures the push queue from outside the dispatcher.
 *
 * The dispatcher's failure mode is the one the reconciliation sweep had: silence.
 * A push is written to `Notification` and delivered later by a timer, so a
 * dispatcher that has stopped leaves rows nobody sees — the member still has the
 * in-app entry, no request fails, and the log says nothing because nothing was
 * attempted. Measuring the queue is the evidence a stopped timer cannot fake, and
 * it is better than a "last sweep ran at" field in three ways: it survives a
 * restart (a per-process counter cannot), it states how much is waiting rather
 * than only when the timer last fired, and it ages on its own if the timer stops.
 *
 * The conditions are the dispatcher's own — pending, retries left, recipient with
 * a device — plus the rows it would requeue, so "due" here cannot drift from what
 * the next tick would actually take. Depends on nothing but the client and the
 * clock, so the health module can report it without importing the notifications
 * graph (gateways, auth) into every bootstrap.
 */
@Injectable()
export class PushBacklogService {
  private readonly logger = new Logger(PushBacklogService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
  ) {}

  /**
   * The queue as of now, or null when it could not be read.
   *
   * Null rather than an empty queue: "could not ask" and "nothing waiting" are
   * different facts, and reporting zeros for a failed query is the mistake the
   * sweep's per-pass counts already avoid by publishing `null`.
   */
  async measure(): Promise<PushBacklog | null> {
    const now = this.clock.now();
    const staleBefore = new Date(now.getTime() - PUSH_SENDING_STALE_MS);
    try {
      // Raw SQL rather than `notification.groupBy`. Prisma compiles the relation
      // filter for "the recipient has a device" into a LEFT JOIN of every `User`
      // plus an EXISTS; measured on 50k users that was a full scan of the user
      // table on every readiness poll (12 ms, 670 buffers) against 0.3 ms and 17
      // buffers for this, which asks the same question with the EXISTS alone. The
      // composite index on (channel, status, createdAt) is the one the dispatcher
      // reads through, so both statements see the same rows.
      //
      // `AT TIME ZONE 'UTC'` keeps both readings independent of the connection's
      // timezone: the timestamp columns store a UTC wall clock, and returning the
      // oldest as an explicit instant means the age cannot shift with a server's
      // local zone.
      const rows = await this.prisma.$queryRaw<QueueCountRow[]>`
        SELECT n."status"::text AS "status",
               COUNT(*) AS "count",
               MIN(n."createdAt") AT TIME ZONE 'UTC' AS "oldest"
        FROM "Notification" n
        WHERE n."channel" = 'PUSH'
          AND (
            (n."status" = 'PENDING'
              AND n."attempts" < ${PUSH_MAX_ATTEMPTS}
              AND EXISTS (SELECT 1 FROM "DeviceToken" d WHERE d."userId" = n."userId"))
            OR (n."status" = 'SENDING'
              AND n."updatedAt" < (${staleBefore}::timestamptz AT TIME ZONE 'UTC'))
          )
        GROUP BY n."status"
      `;

      const countOf = (status: 'PENDING' | 'SENDING'): number =>
        Number(rows.find((row) => row.status === status)?.count ?? 0);

      // The age is measured from `createdAt`: a push that was queued an hour ago
      // and is still undelivered has been owed to its recipient for an hour,
      // whatever the dispatcher last did with it.
      const oldest = rows
        .map((row) => (row.oldest === null ? undefined : new Date(row.oldest).getTime()))
        .filter((at): at is number => at !== undefined);
      const oldestMs = oldest.length > 0 ? Math.min(...oldest) : null;
      const ageMs = oldestMs === null ? null : Math.max(0, now.getTime() - oldestMs);

      return {
        due: countOf('PENDING'),
        abandoned: countOf('SENDING'),
        oldestAt: oldestMs === null ? null : new Date(oldestMs).toISOString(),
        oldestAgeSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
        overdue: ageMs !== null && ageMs > PUSH_BACKLOG_STALE_AFTER_MS,
      };
    } catch (error) {
      const code = (error as Error & { code?: string })?.code ?? '';
      this.logger.error(
        `Could not read the push queue for readiness.${code ? ` [${code}]` : ''}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
