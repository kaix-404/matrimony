import { Logger } from '@nestjs/common';
import { ProviderReconciliationSweeper } from './provider-reconciliation.sweeper';
import type {
  PaymentReconcileSummary,
  PaymentsService,
  RecordedReconcileSummary,
} from '../payments/payments.service';
import { ReconciliationStatusService } from './reconciliation-status.service';
import type {
  VerificationReconcileSummary,
  VerificationService,
} from '../verification/verification.service';

/**
 * The sweep that repairs lost webhooks.
 *
 * What matters here is not the vendor read — that is the services' own tests —
 * but that the sweep runs at boot, that it runs both providers even when one
 * fails, and that a boot leaves one line saying what it did. Cashfree currently
 * refuses this deployment's IPs, so "one provider down, the other still swept"
 * is the ordinary case rather than an edge one.
 */

const NO_PAYMENTS: PaymentReconcileSummary = { checked: 0, settled: 0, unpaid: 0, failed: 0 };
const NO_RECORDED: RecordedReconcileSummary = { checked: 0, replayed: 0, skipped: 0, failed: 0 };
const NO_IDENTITY: VerificationReconcileSummary = {
  checked: 0,
  settled: 0,
  pending: 0,
  failed: 0,
};

function harness(
  options: {
    paymentsFails?: boolean;
    recordedFails?: boolean;
    identityFails?: boolean;
    payments?: PaymentReconcileSummary;
    recorded?: RecordedReconcileSummary;
    identity?: VerificationReconcileSummary;
    /** Held open to stand in for a sweep stuck on a provider that never answers. */
    gate?: Promise<void>;
  } = {},
) {
  const calls: string[] = [];

  const payments = {
    reconcilePending: async (): Promise<PaymentReconcileSummary> => {
      calls.push('payments');
      if (options.gate) await options.gate;
      if (options.paymentsFails) throw Object.assign(new Error('db down'), { code: 'P1001' });
      return options.payments ?? NO_PAYMENTS;
    },
    replayRecordedWebhooks: async (): Promise<RecordedReconcileSummary> => {
      calls.push('recorded');
      if (options.recordedFails) throw new Error('webhook table unavailable');
      return options.recorded ?? NO_RECORDED;
    },
  };

  const verifications = {
    reconcilePending: async (): Promise<VerificationReconcileSummary> => {
      calls.push('identity');
      if (options.identityFails) throw new Error('Cashfree DigiLocker status failed (HTTP 403)');
      return options.identity ?? NO_IDENTITY;
    },
  };

  const status = new ReconciliationStatusService();
  const sweeper = new ProviderReconciliationSweeper(
    payments as unknown as PaymentsService,
    verifications as unknown as VerificationService,
    status,
  );

  return { sweeper, calls, status };
}

/** The boot sweep is fired without awaiting, so let its promise chain settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('ProviderReconciliationSweeper', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    error.mockRestore();
  });

  it('runs every pass at boot: the vendor read, the recorded replay, identity', async () => {
    const { sweeper, calls } = harness();

    sweeper.onApplicationBootstrap();
    await settle();
    sweeper.onModuleDestroy();

    // The replay sits between them on purpose: it settles what is already in our
    // own table, so it can never race the vendor read for the same capture.
    expect(calls).toEqual(['payments', 'recorded', 'identity']);
  });

  it('logs one line at boot saying what it found, so the recovery path is visible', async () => {
    const { sweeper } = harness({
      payments: { checked: 2, settled: 1, unpaid: 1, failed: 0 },
      recorded: { checked: 1, replayed: 1, skipped: 0, failed: 0 },
      identity: { checked: 1, settled: 1, pending: 0, failed: 0 },
    });

    sweeper.onApplicationBootstrap();
    await settle();
    sweeper.onModuleDestroy();

    expect(log).toHaveBeenCalledWith(
      '[reconcile] startup sweep — payments: 2 due, 1 settled, 1 unpaid, 0 errors; ' +
        'events: 1 unprocessed, 1 replayed, 0 need a human, 0 errors; ' +
        'identity: 1 due, 1 applied, 0 unfinished, 0 errors',
    );
  });

  it('still sweeps identity when the payment read fails', async () => {
    const { sweeper, calls } = harness({ paymentsFails: true });

    sweeper.onApplicationBootstrap();
    await settle();
    sweeper.onModuleDestroy();

    // A provider being unreachable must not disable the other's recovery.
    expect(calls).toEqual(['payments', 'recorded', 'identity']);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[reconcile] payments sweep failed'),
      expect.anything(),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('payments: failed'));
  });

  it('still sweeps payments when the identity read fails', async () => {
    const { sweeper, calls } = harness({ identityFails: true });

    sweeper.onApplicationBootstrap();
    await settle();
    sweeper.onModuleDestroy();

    expect(calls).toEqual(['payments', 'recorded', 'identity']);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[reconcile] identity sweep failed'),
      expect.anything(),
    );
  });

  it('shuts down without leaving the timer behind', () => {
    const { sweeper } = harness();

    sweeper.onApplicationBootstrap();
    expect(() => {
      sweeper.onModuleDestroy();
      sweeper.onModuleDestroy();
    }).not.toThrow();
  });
});

describe('ProviderReconciliationSweeper — overlap', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does not start a second sweep while the last one is still running', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { sweeper, calls } = harness({ gate });

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['payments']);

    // The interval fires while the first sweep is stuck on a provider that never
    // answers. Queueing it would double the hung calls; it is skipped instead.
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls).toEqual(['payments']);
    expect(warn).toHaveBeenCalledWith(
      '[reconcile] previous sweep is still running; skipping this one.',
    );

    release();
    await jest.advanceTimersByTimeAsync(0);
    // Draining the released sweep's promise chain without touching faked timers.
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
    expect(calls).toEqual(['payments', 'recorded', 'identity']);

    // The guard is released with the sweep, so the next tick runs normally.
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls).toEqual(['payments', 'recorded', 'identity', 'payments', 'recorded', 'identity']);

    sweeper.onModuleDestroy();
  });

  it('releases the guard even when a provider run throws', async () => {
    jest.useFakeTimers();
    const { sweeper, calls } = harness({ paymentsFails: true, identityFails: true });

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(calls).toEqual(['payments', 'recorded', 'identity', 'payments', 'recorded', 'identity']);

    sweeper.onModuleDestroy();
  });
});

/**
 * The status the health payload renders.
 *
 * A sweeper that died at boot and one that recovered twelve captures are the
 * same absence of evidence in a log nobody is reading. These tests pin that the
 * sweep publishes what it did, that a failing pass is counted rather than
 * swallowed, and that a recovery clears the streak without erasing the history.
 */
describe('ProviderReconciliationSweeper — published status', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('publishes what the last sweep did, so health can report it without the log', async () => {
    const { sweeper, status } = harness({
      payments: { checked: 2, settled: 1, unpaid: 1, failed: 0 },
      recorded: { checked: 1, replayed: 1, skipped: 0, failed: 0 },
      identity: { checked: 1, settled: 1, pending: 0, failed: 0 },
    });

    sweeper.onApplicationBootstrap();
    await settle();
    sweeper.onModuleDestroy();

    const snapshot = status.snapshot();
    expect(snapshot).toMatchObject({
      runs: 1,
      inFlight: false,
      consecutiveFailures: 0,
      lastError: null,
    });
    expect(snapshot.startedAt).toEqual(expect.any(String));
    expect(snapshot.lastRun).toMatchObject({
      payments: { checked: 2, settled: 1, unpaid: 1, failed: 0 },
      recorded: { checked: 1, replayed: 1, skipped: 0, failed: 0 },
      identity: { checked: 1, settled: 1, pending: 0, failed: 0 },
      error: null,
    });
    expect(snapshot.lastRun?.finishedAt).toEqual(expect.any(String));
    expect(snapshot.lastRun?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('counts consecutive failing sweeps, and clears the streak on a clean one', async () => {
    jest.useFakeTimers();
    const options: { paymentsFails?: boolean } = { paymentsFails: true };
    const { sweeper, status } = harness(options);

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(status.snapshot()).toMatchObject({
      runs: 2,
      consecutiveFailures: 2,
      lastError: 'db down',
    });
    // The pass that threw publishes null rather than a summary full of zeros,
    // which would read as "nothing outstanding".
    expect(status.snapshot().lastRun?.payments).toBeNull();

    options.paymentsFails = false;
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(status.snapshot()).toMatchObject({
      runs: 3,
      consecutiveFailures: 0,
      // Kept after recovery: "it failed, then it worked" is the useful history,
      // and the zero streak already says it recovered.
      lastError: 'db down',
    });

    sweeper.onModuleDestroy();
  });
});
