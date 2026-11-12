import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { ClockDriftGuard, ClockService } from '../common/clock/clock.service';
import { VerificationGateway } from '../verification/verification.gateway';
import { SmsGateway } from '../sms/sms.gateway';
import { EmailGateway } from '../email/email.gateway';
import { PushGateway } from '../push/push.gateway';
import { FeatureFlagsService } from '../common/features/feature-flags.service';

/**
 * What this instance is configured for, as one report.
 *
 * Read by two callers with different needs. The public `/health/ready` route is
 * what an orchestrator and the smoke test poll, and it has to be answerable with
 * no session. The console's System status page wants the same facts behind
 * `system:read`. Both come through here, so the two can never disagree about
 * whether email is on.
 */
export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  /** Server time, ISO-8601 UTC. Clients must never use their own clock for expiry. */
  serverTime: string;
  uptimeSeconds: number;
  checks: Record<string, 'up' | 'down'>;
  /**
   * Feature flags as configured on this instance, e.g. `{ aiRecommendations: 'off' }`.
   *
   * Named values rather than booleans: a rollout is a percentage, and "off" and
   * "10%" mean different things to whoever is reading the console.
   */
  flags: Record<string, string>;
}

@Injectable()
export class HealthService {
  /** The process start, so uptime is a fact about this instance rather than a call count. */
  private readonly bootedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly driftGuard: ClockDriftGuard,
    private readonly verification: VerificationGateway,
    private readonly sms: SmsGateway,
    private readonly email: EmailGateway,
    private readonly push: PushGateway,
    private readonly flags: FeatureFlagsService,
  ) {}

  /**
   * The report, degraded or not.
   *
   * Never throws: a degraded instance is exactly the one somebody is trying to
   * read, and a status page that replaces the detail with a generic error is
   * least useful at the moment it matters most.
   */
  async report(): Promise<HealthReport> {
    const database = await this.prisma.isHealthy();
    const clock = this.driftGuard.isHealthy();
    return {
      status: database && clock ? 'ok' : 'degraded',
      service: 'matrimony-api',
      serverTime: this.clock.now().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.bootedAt) / 1000),
      checks: {
        database: database ? 'up' : 'down',
        clock: clock ? 'up' : 'down',
        // Informational, and deliberately not part of `status`: the API is
        // ready to serve even when KYC is switched off (every other surface
        // works). It is reported so a deploy can be checked from outside —
        // "unconfigured" and "the vendor rejected our credentials" both
        // surface as 503 on `/verification/initiate`, and only this or the
        // boot log tells them apart.
        identityVerification: this.verification.configured ? 'up' : 'down',
        // The delivery providers, for the same reason and with the same meaning:
        // a provider with no credentials is not an outage, it is a deployment
        // still waiting on the client's keys. Read from the gateways rather than
        // from the environment, so the answer is the one delivery will use.
        sms: this.sms.configured ? 'up' : 'down',
        email: this.email.configured ? 'up' : 'down',
        push: this.push.configured ? 'up' : 'down',
      },
      flags: { aiRecommendations: this.flags.describe('aiRecommendations') },
    };
  }

  /**
   * Readiness for an orchestrator: the same report, but a degraded instance
   * answers 503 so it is taken out of rotation. The report travels with the
   * error, because "database: down" is the reason and a bare 503 is not.
   */
  async ready(): Promise<HealthReport> {
    const report = await this.report();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
