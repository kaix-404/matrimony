import { FrozenClock } from '../common/clock/clock.service';
import { AccountRetentionStatusService } from './account-retention-status.service';
import {
  ACCOUNT_RETENTION_INTERVAL_MS,
  ACCOUNT_RETENTION_OVERDUE_AFTER_MS,
} from './account-retention.constants';

/**
 * The retention signal exists so a stopped erasure sweep cannot pass in silence.
 * These tests pin what counts as overdue (the same predicate `purgeDue` uses),
 * how long an overrun is tolerated before it is reported, and that an unreadable
 * table is not mistaken for an empty one.
 */
const NOW = new Date('2026-11-11T12:00:00.000Z');

interface AggregateArgs {
  where: { isAnonymised: boolean; purgeAfter: { lte: Date } };
}

interface CountArgs {
  where: { isAnonymised: boolean; purgeAfter: null; deletedAt: { not: null } };
}

function hoursBefore(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function make(result: { count: number; oldest: Date | null; undated?: number } | Error): {
  service: AccountRetentionStatusService;
  calls: AggregateArgs[];
  countCalls: CountArgs[];
} {
  const calls: AggregateArgs[] = [];
  const countCalls: CountArgs[] = [];
  const prisma = {
    user: {
      aggregate: async (args: AggregateArgs) => {
        calls.push(args);
        if (result instanceof Error) throw result;
        return { _count: { _all: result.count }, _min: { purgeAfter: result.oldest } };
      },
      count: async (args: CountArgs) => {
        countCalls.push(args);
        if (result instanceof Error) throw result;
        return result.undated ?? 0;
      },
    },
  };
  const service = new AccountRetentionStatusService(prisma as never, new FrozenClock(NOW));
  return { service, calls, countCalls };
}

describe('AccountRetentionStatusService', () => {
  it('reports how many accounts are past their purge date and how far past the oldest is', async () => {
    const { service } = make({ count: 2, oldest: hoursBefore(3) });

    expect(await service.measure()).toEqual({
      due: 2,
      undated: 0,
      oldestDueAt: hoursBefore(3).toISOString(),
      oldestOverdueSeconds: 3 * 3600,
      // One interval is a legitimate wait: the next six-hourly pass will take it.
      overdue: false,
    });
  });

  it('calls retention overdue once the oldest is two sweeps past its deadline', async () => {
    const { service } = make({
      count: 1,
      oldest: new Date(NOW.getTime() - ACCOUNT_RETENTION_OVERDUE_AFTER_MS - 1),
    });

    expect(await service.measure()).toMatchObject({ due: 1, overdue: true });
  });

  it('tolerates a deadline that only just passed', async () => {
    const { service } = make({ count: 1, oldest: new Date(NOW.getTime() - 60_000) });

    expect(await service.measure()).toMatchObject({ due: 1, overdue: false });
  });

  it('reports nothing overdue with no age rather than a zero wait', async () => {
    const { service } = make({ count: 0, oldest: null });

    expect(await service.measure()).toEqual({
      due: 0,
      undated: 0,
      oldestDueAt: null,
      oldestOverdueSeconds: null,
      overdue: false,
    });
  });

  it('counts soft-deleted accounts with no deadline, so finding one needs no SQL by hand', async () => {
    const { service, countCalls } = make({ count: 0, oldest: null, undated: 4 });

    expect(await service.measure()).toMatchObject({ due: 0, undated: 4 });

    // The cohort `due` cannot express: these rows have no deadline to be late
    // for, and the sweep reaches them through its `deletedAt` fallback.
    expect(countCalls[0].where).toEqual({
      isAnonymised: false,
      purgeAfter: null,
      deletedAt: { not: null },
    });
  });

  it('asks for the rows `purgeDue` would anonymise', async () => {
    const { service, calls } = make({ count: 0, oldest: null });

    await service.measure();

    // The dated cohort, which is what this count is about. `purgeDue` also erases
    // an undated deletion by its deletion date; that row is not overdue in the
    // deadline sense, so it is reported separately as `undated`.
    expect(calls[0].where).toEqual({ isAnonymised: false, purgeAfter: { lte: NOW } });
    expect(ACCOUNT_RETENTION_INTERVAL_MS).toBe(6 * 60 * 60_000);
  });

  it('returns null when the queue cannot be read, instead of an empty queue', async () => {
    const { service } = make(new Error('db down'));

    // A missed deadline hidden behind zeros is the one answer this must never give.
    expect(await service.measure()).toBeNull();
  });
});
