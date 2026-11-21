import { FrozenClock } from '../common/clock/clock.service';
import { PushBacklogService } from './push-backlog.service';
import { PUSH_MAX_ATTEMPTS, PUSH_SENDING_STALE_MS } from './push-dispatch.constants';

/**
 * The backlog is what makes a stopped push dispatcher visible. These tests pin
 * the two things that decide it: which rows count as due (the dispatcher's own
 * conditions, kept as a semi-join on `DeviceToken` rather than a join of every
 * user) and how old the oldest may be before the queue is called stuck.
 */
const NOW = new Date('2026-11-11T12:00:00.000Z');

interface QueueCountRow {
  status: string;
  count: bigint;
  oldest: Date | null;
}

interface QueryCall {
  sql: string;
  values: unknown[];
}

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function make(rows: QueueCountRow[] | Error): {
  service: PushBacklogService;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const prisma = {
    $queryRaw: async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<QueueCountRow[]> => {
      calls.push({ sql: strings.join('?'), values });
      if (rows instanceof Error) throw rows;
      return rows;
    },
  };
  const service = new PushBacklogService(prisma as never, new FrozenClock(NOW));
  return { service, calls };
}

function row(status: 'PENDING' | 'SENDING', count: number, oldest: Date | null): QueueCountRow {
  return { status, count: BigInt(count), oldest };
}

describe('PushBacklogService', () => {
  it('measures the wait from the oldest undelivered row', async () => {
    const { service } = make([
      row('PENDING', 3, minutesBefore(4)),
      row('SENDING', 2, minutesBefore(1)),
    ]);

    expect(await service.measure()).toEqual({
      due: 3,
      abandoned: 2,
      oldestAt: minutesBefore(4).toISOString(),
      oldestAgeSeconds: 240,
      // Four minutes is under the threshold: the next tick is still due to take it.
      overdue: false,
    });
  });

  it('calls the queue overdue once the oldest has waited longer than a running dispatcher would allow', async () => {
    const { service } = make([row('PENDING', 1, minutesBefore(6))]);

    expect(await service.measure()).toMatchObject({ due: 1, oldestAgeSeconds: 360, overdue: true });
  });

  it('reports an empty queue with no age rather than a zero wait', async () => {
    const { service } = make([]);

    expect(await service.measure()).toEqual({
      due: 0,
      abandoned: 0,
      oldestAt: null,
      oldestAgeSeconds: null,
      overdue: false,
    });
  });

  it('asks for the dispatcher’s rows with a semi-join, not a join of every user', async () => {
    const { service, calls } = make([]);

    await service.measure();

    // The device check is an EXISTS against `DeviceToken`: Prisma's relation
    // filter would add `LEFT JOIN "User"`, which measured a full scan of the user
    // table per call. Asserting the shape keeps that regression from returning.
    expect(calls[0].sql).toContain('EXISTS (SELECT 1 FROM "DeviceToken"');
    expect(calls[0].sql).not.toContain('JOIN "User"');
    expect(calls[0].sql).toContain('"channel" = \'PUSH\'');
    expect(calls[0].values).toEqual([
      PUSH_MAX_ATTEMPTS,
      new Date(NOW.getTime() - PUSH_SENDING_STALE_MS),
    ]);
  });

  it('returns null when the queue cannot be read, instead of an empty queue', async () => {
    const { service } = make(new Error('db down'));

    // "Could not ask" must not read as "nothing outstanding": the health report
    // turns a null into `down`, where zeros would have been green.
    expect(await service.measure()).toBeNull();
  });
});
