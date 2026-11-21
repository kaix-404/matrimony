import { FrozenClock } from '../common/clock/clock.service';
import { PushBacklogService } from './push-backlog.service';
import { PUSH_MAX_ATTEMPTS, PUSH_SENDING_STALE_MS } from './push-dispatch.constants';

/**
 * The backlog is what makes a stopped push dispatcher visible. These tests pin
 * the two things that decide it: which rows count as due (the dispatcher's own
 * conditions, so the two cannot drift) and how old the oldest may be before the
 * queue is called stuck.
 */
const NOW = new Date('2026-11-11T12:00:00.000Z');

interface GroupRow {
  status: string;
  _count: { _all: number };
  _min: { createdAt: Date | null };
}

interface AggregateArgs {
  where: { OR: Record<string, unknown>[] };
}

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function make(rows: GroupRow[] | Error): {
  service: PushBacklogService;
  calls: AggregateArgs[];
} {
  const calls: AggregateArgs[] = [];
  const prisma = {
    notification: {
      groupBy: async (args: AggregateArgs): Promise<GroupRow[]> => {
        calls.push(args);
        if (rows instanceof Error) throw rows;
        return rows;
      },
    },
  };
  const service = new PushBacklogService(prisma as never, new FrozenClock(NOW));
  return { service, calls };
}

function row(status: 'PENDING' | 'SENDING', count: number, oldest: Date | null): GroupRow {
  return { status, _count: { _all: count }, _min: { createdAt: oldest } };
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

  it('asks for exactly the rows the dispatcher would take, plus the ones it would requeue', async () => {
    const { service, calls } = make([]);

    await service.measure();

    // Mirrors `PushDispatchService.dispatch`: pending, retries left, a device to
    // send to, and stale `SENDING` rows a live dispatcher would put back.
    expect(calls[0].where.OR).toEqual([
      {
        channel: 'PUSH',
        status: 'PENDING',
        attempts: { lt: PUSH_MAX_ATTEMPTS },
        user: { deviceTokens: { some: {} } },
      },
      {
        channel: 'PUSH',
        status: 'SENDING',
        updatedAt: { lt: new Date(NOW.getTime() - PUSH_SENDING_STALE_MS) },
      },
    ]);
  });

  it('returns null when the queue cannot be read, instead of an empty queue', async () => {
    const { service } = make(new Error('db down'));

    // "Could not ask" must not read as "nothing outstanding": the health report
    // turns a null into `down`, where zeros would have been green.
    expect(await service.measure()).toBeNull();
  });
});
