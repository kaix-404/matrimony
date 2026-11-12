import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { ClockDriftGuard, ClockService } from '../common/clock/clock.service';
import { VerificationGateway } from '../verification/verification.gateway';
import { SmsGateway } from '../sms/sms.gateway';
import { EmailGateway } from '../email/email.gateway';
import { PushGateway } from '../push/push.gateway';
import { HealthController } from './health.controller';
import { FeatureFlagsService } from '../common/features/feature-flags.service';
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
  } = {},
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
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
        provide: FeatureFlagsService,
        useValue: new FeatureFlagsService({
          FEATURE_AI_RECOMMENDATIONS: options.recommendations ?? false,
        } as unknown as Env),
      },
    ],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController (section 46 readiness)', () => {
  it('reports each provider as configured or not, alongside the real checks', async () => {
    const controller = await build({ sms: true, identity: true });

    const report = await controller.ready();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({
      database: 'up',
      clock: 'up',
      identityVerification: 'up',
      sms: 'up',
      email: 'down',
      push: 'down',
    });
  });

  it('stays ready when no delivery provider is configured', async () => {
    const controller = await build();

    const report = await controller.ready();

    // A missing credential is a deployment state, not a fault: everything that
    // does not need the vendor still works.
    expect(report.status).toBe('ok');
    expect(report.checks.sms).toBe('down');
    expect(report.checks.email).toBe('down');
    expect(report.checks.push).toBe('down');
  });

  it('reports the flag value so a console can show it', async () => {
    const controller = await build({ recommendations: 10 });

    const report = await controller.ready();

    // A percentage is reported as such, not as "on": support answering "is For
    // You live?" needs to see the rollout, not a boolean.
    expect(report.flags).toEqual({ aiRecommendations: '10%' });
  });

  it('reports the server clock, and the process uptime', async () => {
    const controller = await build();

    const report = await controller.ready();

    expect(report.serverTime).toBe('2026-11-11T12:00:00.000Z');
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('fails with the report attached when the database is not usable', async () => {
    const controller = await build({ database: false, sms: true });

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        status: 'degraded',
        checks: { database: 'down', clock: 'up', sms: 'up' },
      },
    });
  });

  it('fails when the clock jumped, because expiry is priced against it', async () => {
    const controller = await build({ clock: false });

    await expect(controller.ready()).rejects.toMatchObject({
      response: { status: 'degraded', checks: { database: 'up', clock: 'down' } },
    });
  });
});
