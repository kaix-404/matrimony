import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.module';
import { ClockDriftGuard, ClockService } from '../common/clock/clock.service';
import { VerificationGateway } from '../verification/verification.gateway';
import { SmsGateway } from '../sms/sms.gateway';
import { EmailGateway } from '../email/email.gateway';
import { PushGateway } from '../push/push.gateway';

interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  /** Server time, ISO-8601 UTC. Clients must never use their own clock for expiry. */
  serverTime: string;
  uptimeSeconds: number;
  checks: Record<string, 'up' | 'down'>;
}

@Controller('health')
export class HealthController {
  private readonly bootedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly driftGuard: ClockDriftGuard,
    private readonly verification: VerificationGateway,
    private readonly sms: SmsGateway,
    private readonly email: EmailGateway,
    private readonly push: PushGateway,
  ) {}

  /**
   * Liveness. Answers only if the process is running, so an orchestrator does
   * not kill a container that is merely waiting on a slow database.
   */
  @SkipThrottle()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness. Includes a real database round-trip, because a pool that is
   * connected but unable to execute is not ready to serve traffic.
   *
   * A backwards clock jump also fails readiness: unlock windows are priced and
   * expired against server time, so an instance whose clock jumped is unsafe
   * for payments even though it can still execute SQL.
   */
  @SkipThrottle()
  @Get('ready')
  async ready(): Promise<HealthReport> {
    const database = await this.prisma.isHealthy();
    const clock = this.driftGuard.isHealthy();
    const report: HealthReport = {
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
    };
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
