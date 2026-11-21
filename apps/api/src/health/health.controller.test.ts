import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { ClockDriftGuard, ClockService } from '../common/clock/clock.service';
import { VerificationGateway } from '../verification/verification.gateway';
import { SmsGateway } from '../sms/sms.gateway';
import { EmailGateway } from '../email/email.gateway';
import { PushGateway } from '../push/push.gateway';
import { PaymentGateway } from '../payments/payment.gateway';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { FeatureFlagsService } from '../common/features/feature-flags.service';
import {
  ReconciliationStatusService,
  type ReconciliationStatus,
} from '../reconciliation/reconciliation-status.service';
import { PushBacklogService, type PushBacklog } from '../notifications/push-backlog.service';
import type { Env } from '../config/env';

/**
 * Readiness has to answer two different questions without confusing them: is this
 * instance able to serve traffic, and which integrations are still switched off.
 *
 * That distinction is what these tests are about. A deployment waiting on the
 * client's MSG91 or Firebase keys is fully functional — registration, discovery
 * and payments all work — so an unconfigured provider must not take the instance
 * out of the load balancer and turn a missing key into an outage.
 */
async function build(
  options: {
    database?: boolean;
    clock?: boolean;
    sms?: boolean;
    email?: boolean;
    push?: boolean;
    identity?: boolean;
    payments?: boolean;
    paymentWebhooks?: boolean;
    reconciliation?: Partial<ReconciliationStatus>;
    pushBacklog?: Partial<PushBacklog> | null;
    recommendations?: number;
  } = {},
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: PrismaService, useValue: { isHealthy: async () => options.database ?? true } },
      {
        provide: ClockService,
        useValue: { now: (): Date => new Date('2026-11-11T12:00:00.000Z') },
      },
      { provide: ClockDriftGuard, useValue: { isHealthy: () => options.clock ?? true } },
      { provide: VerificationGateway, useValue: { configured: options.identity ?? false } },
      { provide: SmsGateway, useValue: { configured: options.sms ?? false } },
      { provide: EmailGateway, useValue: { configured: options.email ?? false } },
      { provide: PushGateway, useValue: { configured: options.push ?? false } },
      {
        provide: PaymentGateway,
        useValue: {
          configured: options.payments ?? false,
          webhookConfigured: options.paymentWebhooks ?? false,
        },
      },
      {
        provide: ReconciliationStatusService,
        useValue: {
          snapshot: (): ReconciliationStatus => ({
            runs: 1,
            inFlight: false,
            startedAt: '2026-11-11T11:59:00.000Z',
            lastRun: null,
            consecutiveFailures: 0,
            lastError: null,
            stale: false,
            ...options.reconciliation,
          }),
        },
      },
      {
        provide: PushBacklogService,
        useValue: {
          measure: async (): Promise<PushBacklog | null> =>
            options.pushBacklog === null
              ? null
              : {
                  due: 0,
                  abandoned: 0,
                  oldestAt: null,
                  oldestAgeSeconds: null,
                  overdue: false,
                  ...options.pushBacklog,
                },
        },
      },
      {
        provide: FeatureFlagsService,
        useValue: new FeatureFlagsService({
          FEATURE_AI_RECOMMENDATIONS: options.recommendations ?? false,
        } as unknown as Env),
      },
    ],
  }).compile();
  return moduleRef;
}

describe('HealthController (section 46 readiness)', () => {
  it('reports each provider as configured or not, alongside the real checks', async () => {
    const controller = await build({ sms: true, identity: true }).then((ref) =>
      ref.get(HealthController),
    );

    const report = await controller.ready();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({
      database: 'up',
      clock: 'up',
      identityVerification: 'up',
      sms: 'up',
      email: 'down',
      push: 'down',
      payments: 'down',
      paymentWebhooks: 'down',
      reconciliation: 'up',
      pushDispatch: 'up',
    });
  });

  it('reports the last sweep, so a sweeper that never ran is visible', async () => {
    const controller = await build({ reconciliation: { runs: 0 } }).then((ref) =>
      ref.get(HealthController),
    );

    const report = await controller.ready();

    // Booted milliseconds ago: a sweep that has not finished yet is normal, not
    // a fault. `runs: 0` is what a reader looks at on an instance older than
    // the grace period.
    expect(report.checks.reconciliation).toBe('up');
    expect(report.reconciliation.runs).toBe(0);
  });

  it('marks reconciliation down when sweeps keep failing, without failing readiness', async () => {
    const controller = await build({
      reconciliation: {
        runs: 9,
        consecutiveFailures: 9,
        lastError: 'Cashfree DigiLocker status failed (HTTP 403)',
      },
    }).then((ref) => ref.get(HealthController));

    const report = await controller.ready();

    // The failure this reports is a silent repair path, not an outage: members
    // are served either way, so it must not take the instance out of rotation.
    expect(report.status).toBe('ok');
    expect(report.checks.reconciliation).toBe('down');
    expect(report.reconciliation).toMatchObject({
      runs: 9,
      consecutiveFailures: 9,
      lastError: 'Cashfree DigiLocker status failed (HTTP 403)',
    });
  });

  it('marks reconciliation down when the timer has stopped, without failing readiness', async () => {
    const controller = await build({ reconciliation: { runs: 12, stale: true } }).then((ref) =>
      ref.get(HealthController),
    );

    const report = await controller.ready();

    // Nothing failed and nothing is running: the last sweep was clean, and the
    // timer that should have started the next one died. That is not "Running
    // normally", and it must not take the instance out of rotation either.
    expect(report.status).toBe('ok');
    expect(report.checks.reconciliation).toBe('down');
    expect(report.reconciliation).toMatchObject({ consecutiveFailures: 0, stale: true });
  });

  it('reports the push queue, so a dispatcher that stopped is visible', async () => {
    const controller = await build({
      push: true,
      pushBacklog: {
        due: 4,
        abandoned: 1,
        oldestAt: '2026-11-11T11:57:00.000Z',
        oldestAgeSeconds: 180,
      },
    }).then((ref) => ref.get(HealthController));

    const report = await controller.ready();

    expect(report.pushBacklog).toMatchObject({ due: 4, abandoned: 1, oldestAgeSeconds: 180 });
    expect(report.checks.pushDispatch).toBe('up');
  });

  it('marks push dispatch down when the oldest queued push is overdue', async () => {
    const controller = await build({
      push: true,
      pushBacklog: { due: 12, oldestAgeSeconds: 900, overdue: true },
    }).then((ref) => ref.get(HealthController));

    const report = await controller.ready();

    // Nothing threw and nothing is unconfigured: the timer that drains the queue
    // simply stopped, which no request and no log line would otherwise show.
    expect(report.status).toBe('ok');
    expect(report.checks.pushDispatch).toBe('down');
  });

  it('does not fault an undrained queue when push has no credentials', async () => {
    const controller = await build({
      push: false,
      pushBacklog: { due: 40, oldestAgeSeconds: 86_400, overdue: true },
    }).then((ref) => ref.get(HealthController));

    const report = await controller.ready();

    // Without FCM keys the dispatcher is correctly a no-op, so the queue growing
    // is a deployment state rather than a stopped timer. `push` names the cause.
    expect(report.checks.push).toBe('down');
    expect(report.checks.pushDispatch).toBe('up');
  });

  it('reports an unreadable queue as down rather than as an empty one', async () => {
    const controller = await build({ push: true, pushBacklog: null }).then((ref) =>
      ref.get(HealthController),
    );

    const report = await controller.ready();

    expect(report.pushBacklog).toBeNull();
    expect(report.checks.pushDispatch).toBe('down');
  });

  it('reports a charge that cannot be confirmed as its own state', async () => {
    const controller = await build({ payments: true, paymentWebhooks: false }).then((ref) =>
      ref.get(HealthController),
    );

    // Checkout works and the webhook does not: money can be taken and no unlock
    // granted. That is not "payments down", and reporting it as one bool would
    // hide it until a member complains.
    const report = await controller.ready();
    expect(report.checks.payments).toBe('up');
    expect(report.checks.paymentWebhooks).toBe('down');
  });

  it('stays ready when no delivery provider is configured', async () => {
    const controller = await build().then((ref) => ref.get(HealthController));

    const report = await controller.ready();

    // A missing credential is a deployment state, not a fault: everything that
    // does not need the vendor still works.
    expect(report.status).toBe('ok');
    expect(report.checks.sms).toBe('down');
    expect(report.checks.email).toBe('down');
    expect(report.checks.push).toBe('down');
  });

  it('reports the flag value so a console can show it', async () => {
    const controller = await build({ recommendations: 10 }).then((ref) =>
      ref.get(HealthController),
    );

    const report = await controller.ready();

    // A percentage is reported as such, not as "on": support answering "is For
    // You live?" needs to see the rollout, not a boolean.
    expect(report.flags).toEqual({ aiRecommendations: '10%' });
  });

  it('reports the server clock, and the process uptime', async () => {
    const controller = await build().then((ref) => ref.get(HealthController));

    const report = await controller.ready();

    expect(report.serverTime).toBe('2026-11-11T12:00:00.000Z');
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('fails with the report attached when the database is not usable', async () => {
    const controller = await build({ database: false, sms: true }).then((ref) =>
      ref.get(HealthController),
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        status: 'degraded',
        checks: { database: 'down', clock: 'up', sms: 'up' },
      },
    });
  });

  it('fails when the clock jumped, because expiry is priced against it', async () => {
    const controller = await build({ clock: false }).then((ref) => ref.get(HealthController));

    await expect(controller.ready()).rejects.toMatchObject({
      response: { status: 'degraded', checks: { database: 'up', clock: 'down' } },
    });
  });

  describe('the deployed revision', () => {
    const original = process.env.RENDER_GIT_COMMIT;

    afterEach(() => {
      if (original === undefined) delete process.env.RENDER_GIT_COMMIT;
      else process.env.RENDER_GIT_COMMIT = original;
    });

    it('reports the commit Render deployed, so production can be compared with main', async () => {
      process.env.RENDER_GIT_COMMIT = 'd1ff86e3c0bb5f30e1a7f3b0b0a1c55f4dfc1b2a';
      const controller = await build().then((ref) => ref.get(HealthController));

      await expect(controller.ready()).resolves.toMatchObject({
        revision: 'd1ff86e3c0bb5f30e1a7f3b0b0a1c55f4dfc1b2a',
      });
    });

    it('reports null where there is no deployed commit to report', async () => {
      delete process.env.RENDER_GIT_COMMIT;
      const controller = await build().then((ref) => ref.get(HealthController));

      const report = await controller.ready();

      expect(report.revision).toBeNull();
    });
  });

  it('hands the console the degraded report rather than an error', async () => {
    const health = (await build({ database: false })).get(HealthService);

    // The System status page is read to find out *what* is down, so the same
    // facts that make readiness fail have to survive as a 200 for it.
    await expect(health.report()).resolves.toMatchObject({
      status: 'degraded',
      checks: { database: 'down' },
    });
  });
});
