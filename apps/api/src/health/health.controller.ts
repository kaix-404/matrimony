import { Controller, Get, Header, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService, type HealthReport } from './health.service';
import { buildAlertReport, type HealthAlertReport } from './health-alerts';

/**
 * Public health endpoints.
 *
 * The report itself lives in `HealthService`, so the console's `system:read`
 * route renders the identical facts rather than a second copy of this logic.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

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
    return this.health.ready();
  }

  /**
   * The alertable view: 503 when a repair path has stopped.
   *
   * Readiness stays 200 while a sweep, the dispatcher or the clock watchdog is
   * down — deliberately, because a broken timer must not take a working API out
   * of rotation. That choice left the failure mode this whole family of checks
   * was built for: nobody is told until somebody opens `/status`. This is the
   * one endpoint a prober can poll for exactly the opposite answer.
   *
   * Public, unauthenticated, and reduced to check names on purpose (see
   * `health-alerts.ts`): a scheduler that has to hold a session token is one more
   * secret in a second place, and the detail is not needed to act.
   */
  @SkipThrottle()
  @Get('alerts')
  @Header('cache-control', 'no-store')
  async alerts(@Res({ passthrough: true }) response: Response): Promise<HealthAlertReport> {
    const report = await this.health.report();
    const alert = buildAlertReport(report.checks, report.serverTime);
    response.status(alert.status === 'ok' ? 200 : 503);
    return alert;
  }
}
