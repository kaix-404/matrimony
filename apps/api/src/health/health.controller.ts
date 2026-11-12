import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService, type HealthReport } from './health.service';

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
}
