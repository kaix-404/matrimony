import {
  pushState,
  retentionState,
  sweepState,
  type AccountRetention,
  type PushBacklog,
  type ReconciliationStatus,
} from './status-state';

/**
 * A retention queue that owes nothing and knows about nothing.
 *
 * Every test states only the fact it is about, so a new field on the payload
 * cannot silently change the answer under an old test.
 */
const retention = (overrides: Partial<AccountRetention> = {}): AccountRetention => ({
  due: 0,
  undated: 0,
  oldestDueAt: null,
  oldestOverdueSeconds: null,
  overdue: false,
  ...overrides,
});

/** A sweep that has run once and is idle. */
const sweep = (overrides: Partial<ReconciliationStatus> = {}): ReconciliationStatus => ({
  runs: 1,
  inFlight: false,
  startedAt: null,
  lastRun: null,
  consecutiveFailures: 0,
  lastError: null,
  stale: false,
  ...overrides,
});

/** An empty push queue on a deployment that can send. */
const backlog = (overrides: Partial<PushBacklog> = {}): PushBacklog => ({
  due: 0,
  abandoned: 0,
  oldestAt: null,
  oldestAgeSeconds: null,
  overdue: false,
  ...overrides,
});

describe('retentionState', () => {
  it('names undated deletions instead of calling the queue up to date', () => {
    expect(retentionState(retention({ undated: 2 }))).toEqual({
      label: '2 deleted with no purge date',
      tone: 'done',
    });
  });

  it('reads the same way for a single undated row', () => {
    expect(retentionState(retention({ undated: 1 }))).toEqual({
      label: '1 deleted with no purge date',
      tone: 'done',
    });
  });

  it('does not turn undated rows into a warning', () => {
    // The sweep erases them by their deletion date, so nothing is owed. `wip`
    // here would put a stopped-timer reading on a queue that is fine.
    expect(retentionState(retention({ undated: 9 })).tone).toBe('done');
  });

  it('reports overdue ahead of everything else', () => {
    expect(retentionState(retention({ overdue: true, due: 3, undated: 2 }))).toEqual({
      label: 'Overdue',
      tone: 'wip',
    });
  });

  it('keeps "Due on the next sweep" ahead of the undated count', () => {
    expect(retentionState(retention({ due: 3, undated: 2 }))).toEqual({
      label: 'Due on the next sweep',
      tone: 'done',
    });
  });

  it('says up to date only when there is nothing to report', () => {
    expect(retentionState(retention())).toEqual({ label: 'Up to date', tone: 'done' });
    expect(retentionState(retention({ undated: 0 }))).toEqual({
      label: 'Up to date',
      tone: 'done',
    });
  });

  it('treats a missing undated count as none rather than as an error', () => {
    // An admin newer than the API it reads. The card shows `-` for the count, but
    // the state must still be the one the rest of the payload supports.
    const older: AccountRetention = {
      due: 0,
      oldestDueAt: null,
      oldestOverdueSeconds: null,
      overdue: false,
    };

    expect(retentionState(older)).toEqual({ label: 'Up to date', tone: 'done' });
  });
});

describe('sweepState', () => {
  it('calls a hung sweep stalled even though it still claims to be in flight', () => {
    expect(sweepState(sweep({ stale: true, inFlight: true }))).toEqual({
      label: 'Stalled',
      tone: 'wip',
    });
  });

  it('reports a running sweep', () => {
    expect(sweepState(sweep({ inFlight: true }))).toEqual({ label: 'Running now', tone: 'wip' });
  });

  it('reports a sweep that never ran', () => {
    expect(sweepState(sweep({ runs: 0 }))).toEqual({ label: 'Never ran', tone: 'wip' });
  });

  it('counts consecutive failures', () => {
    expect(sweepState(sweep({ consecutiveFailures: 2 }))).toEqual({
      label: '2 failing in a row',
      tone: 'wip',
    });
  });

  it('reports a healthy sweep', () => {
    expect(sweepState(sweep())).toEqual({ label: 'Running normally', tone: 'done' });
  });
});

describe('pushState', () => {
  it('says not configured before it says delayed', () => {
    // Without FCM credentials a growing queue is the expected state, not a
    // stopped dispatcher worth hunting for.
    expect(pushState(backlog({ overdue: true, due: 12 }), false)).toEqual({
      label: 'Not configured',
      tone: 'wip',
    });
  });

  it('reports a queue past the dispatcher deadline as delayed', () => {
    expect(pushState(backlog({ overdue: true, due: 3 }), true)).toEqual({
      label: 'Delayed',
      tone: 'wip',
    });
  });

  it('reports an empty queue', () => {
    expect(pushState(backlog(), true)).toEqual({ label: 'Nothing queued', tone: 'done' });
  });

  it('reports a queue being drained', () => {
    expect(pushState(backlog({ due: 5, oldestAgeSeconds: 90 }), true)).toEqual({
      label: 'Draining',
      tone: 'done',
    });
  });

  it('still reports rows abandoned mid-send as work in the queue', () => {
    expect(pushState(backlog({ abandoned: 1 }), true)).toEqual({
      label: 'Draining',
      tone: 'done',
    });
  });
});
