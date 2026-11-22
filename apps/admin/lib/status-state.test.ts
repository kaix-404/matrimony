import {
  duration,
  humanSeconds,
  pushState,
  retentionState,
  shortRevision,
  sweepPasses,
  sweepState,
  type AccountRetention,
  type PushBacklog,
  type ReconciliationRun,
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

/** A sweep run that worked all three passes. */
const run = (overrides: Partial<ReconciliationRun> = {}): ReconciliationRun => ({
  finishedAt: '2026-11-11T12:00:00.000Z',
  durationMs: 842,
  payments: { checked: 3, settled: 1, unpaid: 2, failed: 0 },
  recorded: { checked: 5, replayed: 1, skipped: 4, failed: 0 },
  identity: { checked: 2, settled: 2, pending: 0, failed: 0 },
  error: null,
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

describe('sweepPasses', () => {
  it('words each pass with the counts that pass collects', () => {
    expect(sweepPasses(run())).toEqual([
      { label: 'Payments (gateway)', checked: 3, outcome: '1 settled, 2 unpaid, 0 failed' },
      { label: 'Recorded webhooks', checked: 5, outcome: '1 replayed, 4 skipped, 0 failed' },
      { label: 'Identity checks', checked: 2, outcome: '2 settled, 0 pending, 0 failed' },
    ]);
  });

  it('omits a pass that did not run', () => {
    // A run from a release without the identity pass reports two rows, not a row
    // of zeros claiming it checked nothing successfully.
    expect(sweepPasses(run({ identity: null }))).toEqual([
      { label: 'Payments (gateway)', checked: 3, outcome: '1 settled, 2 unpaid, 0 failed' },
      { label: 'Recorded webhooks', checked: 5, outcome: '1 replayed, 4 skipped, 0 failed' },
    ]);
  });

  it('returns no rows when the run recorded no pass at all', () => {
    expect(sweepPasses(run({ payments: null, recorded: null, identity: null }))).toEqual([]);
  });
});

describe('duration', () => {
  it('keeps milliseconds below a second', () => {
    expect(duration(0)).toBe('0 ms');
    expect(duration(842)).toBe('842 ms');
    expect(duration(999)).toBe('999 ms');
  });

  it('switches to seconds at one thousand milliseconds', () => {
    expect(duration(1000)).toBe('1.0 seconds');
    expect(duration(1500)).toBe('1.5 seconds');
  });
});

describe('humanSeconds', () => {
  it('keeps spans under ninety seconds in seconds, singular for one', () => {
    expect(humanSeconds(0)).toBe('0 seconds');
    expect(humanSeconds(1)).toBe('1 second');
    expect(humanSeconds(60)).toBe('60 seconds');
    expect(humanSeconds(89)).toBe('89 seconds');
  });

  it('rounds to minutes from ninety seconds', () => {
    expect(humanSeconds(90)).toBe('2 minutes');
    expect(humanSeconds(5340)).toBe('89 minutes');
  });

  it('rounds to hours at ninety minutes', () => {
    expect(humanSeconds(5400)).toBe('2 hours');
    expect(humanSeconds(7200)).toBe('2 hours');
  });
});

describe('shortRevision', () => {
  it('shortens a commit to seven characters', () => {
    expect(shortRevision('cf17aa3c9f1b3a5e8d2c4b6a0f9e1d3c5b7a9f2e')).toBe('cf17aa3');
  });

  it('keeps a revision shorter than that as it is', () => {
    expect(shortRevision('abc123')).toBe('abc123');
  });

  it('says so when the instance was not deployed from a commit', () => {
    expect(shortRevision(null)).toBe('Unknown - not deployed from a commit');
    expect(shortRevision(undefined)).toBe('Unknown - not deployed from a commit');
  });
});
