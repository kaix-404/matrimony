import { Logger } from '@nestjs/common';
import { ProviderReconciliationSweeper } from './provider-reconciliation.sweeper';
import type { PaymentReconcileSummary, PaymentsService } from '../payments/payments.service';
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
const NO_IDENTITY: VerificationReconcileSummary = {
  checked: 0,
  settled: 0,
  pending: 0,
  failed: 0,
};

function harness(
  options: {
    paymentsFails?: boolean;
    identityFails?: boolean;
    payments?: PaymentReconcileSummary;
    identity?: VerificationReconcileSummary;
  } = {},
) {
  const calls: string[] = [];

  const payments = {
    reconcilePending: async (): Promise<PaymentReconcileSummary> => {
      calls.push('payments');
      if (options.paymentsFails) throw Object.assign(new Error('db down'), { code: 'P1001' });
      return options.payments ?? NO_PAYMENTS;
    },
  };

  const verifications = {
    reconcilePending: async (): Promise<VerificationReconcileSummary> => {
      calls.push('identity');
      if (options.identityFails) throw new Error('Cashfree DigiLocker status failed (HTTP 403)');
      return options.identity ?? NO_IDENTITY;
    },
  };

  const sweeper = new ProviderReconciliationSweeper(
    payments as unknown as PaymentsService,
    verifications as unknown as VerificationService,
  );

  return { sweeper, calls };
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

  it('sweeps both providers at boot', async () => {
    const { sweeper, calls } = harness();

    sweeper.onApplicationBootstrap();
    await settle();
    sweeper.onModuleDestroy();

    expect(calls).toEqual(['payments', 'identity']);
  });

  it('logs one line at boot saying what it found, so the recovery path is visible', async () => {
    const { sweeper } = harness({
      payments: { checked: 2, settled: 1, unpaid: 1, failed: 0 },
      identity: { checked: 1, settled: 1, pending: 0, failed: 0 },
    });

    sweeper.onApplicationBootstrap();
    await settle();
    sweeper.onModuleDestroy();

    expect(log).toHaveBeenCalledWith(
      '[reconcile] startup sweep — payments: 2 due, 1 settled, 1 unpaid, 0 errors; ' +
        'identity: 1 due, 1 applied, 0 unfinished, 0 errors',
    );
  });

  it('still sweeps identity when the payment read fails', async () => {
    const { sweeper, calls } = harness({ paymentsFails: true });

    sweeper.onApplicationBootstrap();
    await settle();
    sweeper.onModuleDestroy();

    // A provider being unreachable must not disable the other's recovery.
    expect(calls).toEqual(['payments', 'identity']);
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

    expect(calls).toEqual(['payments', 'identity']);
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
