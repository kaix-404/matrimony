import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import {
  CLOCK_CHECK_STALE_AFTER_MS,
  ClockDriftGuard,
  ClockService,
} from '../common/clock/clock.service';
import { VerificationGateway } from '../verification/verification.gateway';
import { SmsGateway } from '../sms/sms.gateway';
import { EmailGateway } from '../email/email.gateway';
import { PushGateway } from '../push/push.gateway';
import { PaymentGateway } from '../payments/payment.gateway';
import { FeatureFlagsService } from '../common/features/feature-flags.service';
import {
  ReconciliationStatusService,
  type ReconciliationStatus,
} from '../reconciliation/reconciliation-status.service';
import { PushBacklogService, type PushBacklog } from '../notifications/push-backlog.service';

/**
 * How long after boot a sweep that has never run is still normal.
 *
 * The boot sweep starts immediately, so this only covers a slow start: past it,
 * `runs: 0` means the recovery path never ran at all.
 */
const RECONCILIATION_BOOT_GRACE_SECONDS = 120;

/** The deployed commit; see {@link HealthReport.revision} for what it means. */
function deployedRevision(): string | null {
  const commit = process.env.RENDER_GIT_COMMIT?.trim();
  return commit ? commit : null;
}

/**
 * The clock watchdog's liveness, next to its verdict.
 *
 * `checks.clock` answers "has the clock jumped", from the last check the guard
 * ran. If its timer dies that answer simply stays the last one it ever gave, so
 * the time of that check is reported separately instead of being folded into the
 * verdict: a stopped watchdog is not evidence the clock moved.
 */
export interface ClockGuardReport {
  /** When the drift check last ran; null before the first check or after shutdown. */
  lastCheckedAt: string | null;
  /** Milliseconds of backwards drift observed, if any. */
  observedDriftMs: number | null;
  /** True when no check has run for longer than two intervals. */
  stale: boolean;
}

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
  /**
   * The commit this instance was deployed from, as Render reports it.
   *
   * Everything else here describes what an instance is *configured* for; this is
   * the only field that says *which release* is actually running. A deploy whose
   * build never ran keeps serving the previous artifact, and until now the only
   * way to tell was to probe for a route the newer release added and read a 404
   * as "not deployed" — a conclusion that depends on guessing the route, and on
   * that route having shipped in exactly the release being looked for.
   *
   * Null off Render (local development, tests), where there is no deployed
   * commit to claim. Null rather than an empty string, so "not deployed from a
   * commit" can never be mistaken for one.
   */
  revision: string | null;
  /** Server time, ISO-8601 UTC. Clients must never use their own clock for expiry. */
  serverTime: string;
  uptimeSeconds: number;
  checks: Record<string, 'up' | 'down'>;
  /** Whether the clock drift check is still being taken, and what it last saw. */
  clockGuard: ClockGuardReport;
  /**
   * The last reconciliation sweep, in full.
   *
   * Reported because this module's own failure mode is silence: before this,
   * "the sweep recovered twelve captures" and "the sweep never started" looked
   * identical from outside unless somebody went and grepped the log. `runs: 0`
   * on an instance that has been up for a while is the fact that says the
   * recovery path did not run; `consecutiveFailures` is what turns an unchanging
   * vendor error into a state a person can act on.
   */
  reconciliation: ReconciliationStatus;
  /**
   * How long the push queue has been waiting, or null when it could not be read.
   *
   * The same silence problem as the sweep, one layer down: a push is written to
   * the database and delivered by a timer, so a dispatcher that stopped leaves
   * rows whose only trace is that nobody received anything — the in-app entry
   * still looks normal and no request fails. Measured from the queue rather than
   * from the timer, so it survives a restart and says how much is waiting and for
   * how long, which a "the timer last fired at" field cannot.
   */
  pushBacklog: PushBacklog | null;
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
    private readonly payments: PaymentGateway,
    private readonly reconciliationState: ReconciliationStatusService,
    private readonly pushBacklogQueue: PushBacklogService,
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
    const now = this.clock.now();
    const uptimeSeconds = Math.floor((Date.now() - this.bootedAt) / 1000);
    const checkedAtMs = this.driftGuard.lastCheckedAtMs();
    // A fresh boot gets the same grace the sweeper does: the first check runs at
    // bootstrap, so "no check yet" only means stopped once the instance is older
    // than the interval it should have been checked in.
    const clockGuardStale =
      checkedAtMs === null
        ? uptimeSeconds * 1000 >= CLOCK_CHECK_STALE_AFTER_MS
        : now.getTime() - checkedAtMs > CLOCK_CHECK_STALE_AFTER_MS;
    const clockGuard: ClockGuardReport = {
      lastCheckedAt: checkedAtMs === null ? null : new Date(checkedAtMs).toISOString(),
      observedDriftMs: this.driftGuard.observedDriftMs(),
      stale: clockGuardStale,
    };
    const reconciliation = this.reconciliationState.snapshot(now);
    const pushBacklog = await this.pushBacklogQueue.measure();
    // Down means the recovery path is not doing its job — it never started, it
    // stopped (no sweep for longer than an interval, so the timer died even if
    // the last run was clean), or every recent run threw. Like the provider
    // flags, being down here does not fail readiness: an instance whose sweeper
    // is broken still serves members, and taking it out of rotation would turn a
    // silent repair into an outage.
    const neverRan =
      reconciliation.runs === 0 && uptimeSeconds >= RECONCILIATION_BOOT_GRACE_SECONDS;
    const reconciliationUp =
      !neverRan && !reconciliation.stale && reconciliation.consecutiveFailures === 0;
    // An unconfigured delivery provider is a deployment state, not a fault: the
    // dispatcher is correctly a no-op without FCM credentials, so a growing queue
    // is expected there and `push` above already names the cause. Everywhere else
    // an unreadable queue is down rather than unknown-but-fine, because silence
    // is the failure being reported.
    const pushDispatchUp = !this.push.configured || (pushBacklog !== null && !pushBacklog.overdue);
    return {
      status: database && clock ? 'ok' : 'degraded',
      service: 'matrimony-api',
      revision: deployedRevision(),
      serverTime: now.toISOString(),
      uptimeSeconds,
      checks: {
        database: database ? 'up' : 'down',
        clock: clock ? 'up' : 'down',
        // Whether the watchdog is still sampling, kept apart from `clock` (its
        // verdict): a timer that stopped leaves the verdict green, not wrong,
        // so the two questions cannot share one answer. Like the sweeper's
        // check, this is informational — a stopped watchdog does not fail
        // readiness, because it is not evidence the clock moved.
        clockGuard: clockGuardStale ? 'down' : 'up',
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
        // Payments is two answers, because the two failures are different: no
        // key pair means checkout cannot start, while no webhook secret means a
        // charge can succeed and never be confirmed. Reporting one boolean would
        // call a deployment that takes money and grants nothing "configured".
        payments: this.payments.configured ? 'up' : 'down',
        paymentWebhooks: this.payments.webhookConfigured ? 'up' : 'down',
        // Whether the sweeper is working, as opposed to whether it exists.
        // `reconciliation` above carries the counts and the last error.
        reconciliation: reconciliationUp ? 'up' : 'down',
        // Whether queued pushes are being drained. Derived from the queue's own
        // age, so a dispatcher whose timer died is visible even though nothing
        // failed: the next tick simply never comes.
        pushDispatch: pushDispatchUp ? 'up' : 'down',
      },
      clockGuard,
      reconciliation,
      pushBacklog,
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
