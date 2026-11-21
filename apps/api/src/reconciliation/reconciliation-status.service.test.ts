import {
  ReconciliationStatusService,
  type ReconciliationRun,
} from './reconciliation-status.service';

const NOW = new Date('2026-11-11T12:00:00.000Z');

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function cleanRun(finishedAt: Date): ReconciliationRun {
  return {
    finishedAt: finishedAt.toISOString(),
    durationMs: 900,
    payments: { checked: 2, settled: 1, unpaid: 1, failed: 0 },
    recorded: null,
    identity: null,
    error: null,
  };
}

describe('the reconciliation sweep state', () => {
  it('is current while the sweeps are within an interval', () => {
    const status = new ReconciliationStatusService();
    status.begin(minutesBefore(11));
    status.finish(cleanRun(minutesBefore(9)));

    expect(status.snapshot(NOW)).toMatchObject({ runs: 1, stale: false });
  });

  it('goes stale when the last sweep is older than an interval, even with no failures', () => {
    const status = new ReconciliationStatusService();
    status.begin(minutesBefore(40));
    status.finish(cleanRun(minutesBefore(30)));

    // A clean last run and a dead timer used to read as "Running normally":
    // nothing had failed, because nothing had run.
    expect(status.snapshot(NOW)).toMatchObject({
      runs: 1,
      consecutiveFailures: 0,
      stale: true,
    });
  });

  it('treats a sweep stuck in flight as stale rather than running', () => {
    const status = new ReconciliationStatusService();
    status.begin(minutesBefore(15));

    // The in-flight flag stays set if the process wedges mid-sweep, and a sweep
    // that never finishes also stops every later one.
    expect(status.snapshot(NOW)).toMatchObject({ inFlight: true, stale: true });
  });

  it('leaves "never ran" to the run count, not to staleness', () => {
    const status = new ReconciliationStatusService();

    // A fresh boot has no activity to be overdue, and readiness already has a
    // boot grace for `runs: 0`.
    expect(status.snapshot(NOW)).toMatchObject({ runs: 0, stale: false });
  });
});
