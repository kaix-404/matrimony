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

function hoursBefore(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function make(result: { count: number; oldest: Date | null } | Error): {
  service: AccountRetentionStatusService;
  calls: AggregateArgs[];
} {
  const calls: AggregateArgs[] = [];
  const prisma = {
    user: {
      aggregate: async (args: AggregateArgs) => {
        calls.push(args);
        if (result instanceof Error) throw result;
        return { _count: { _all: result.count }, _min: { purgeAfter: result.oldest } };
      },
    },
  };
  const service = new AccountRetentionStatusService(prisma as never, new FrozenClock(NOW));
  return { service, calls };
}

describe('AccountRetentionStatusService', () => {
  it('reports how many accounts are past their purge date and how far past the oldest is', async () => {
    const { service } = make({ count: 2, oldest: hoursBefore(3) });

    expect(await service.measure()).toEqual({
      due: 2,
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
      oldestDueAt: null,
      oldestOverdueSeconds: null,
      overdue: false,
    });
  });

  it('asks for the rows `purgeDue` would anonymise', async () => {
    const { service, calls } = make({ count: 0, oldest: null });

    await service.measure();

    // Same predicate as `AccountDeletionService.purgeDue`, so the check cannot
    // report a queue the sweep does not see.
    expect(calls[0].where).toEqual({ isAnonymised: false, purgeAfter: { lte: NOW } });
    expect(ACCOUNT_RETENTION_INTERVAL_MS).toBe(6 * 60 * 60_000);
  });

  it('returns null when the queue cannot be read, instead of an empty queue', async () => {
    const { service } = make(new Error('db down'));

    // A missed deadline hidden behind zeros is the one answer this must never give.
    expect(await service.measure()).toBeNull();
  });
});
