import { adminFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { currentAdmin, holdsPermission } from '@/lib/me';

/**
 * What this deployment is switched on for, in one screen.
 *
 * The question this answers is asked constantly and by people who are not
 * developers: "is email working?", "why does nothing get pushed?", "is the For You
 * tab live?". Every one of those was previously a code question — the answer lived
 * in environment variables nobody could read, and the only symptom was a 503 the
 * first time a member tried the feature.
 *
 * Behind `system:read`, which the API enforces: naming every missing credential is
 * a description of the deployment's infrastructure, and that is not something every
 * administrator needs. The check below only spares a role the page it cannot load.
 *
 * Read-only by design. Configuration is a deploy-time decision, and a console
 * button that flipped a provider on would be a way to break production without a
 * record of who did it or what changed. Turning something on stays a deployment.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'System status - Networth Matrimony Admin' };

interface HealthReport {
  status: 'ok' | 'degraded';
  /**
   * The commit the API is running, or null when it was not deployed from one.
   *
   * Optional because the admin deploys independently of the API: a page newer
   * than the report it reads has to render rather than show `undefined`. A
   * failed build leaves the previous artifact serving, so this is the only way
   * to tell from here which release actually took effect.
   */
  revision?: string | null;
  /** The sweeper's own state; absent on an API older than the field. */
  reconciliation?: ReconciliationStatus;
  /** The push queue's age, or null when the API could not read it. */
  pushBacklog?: PushBacklog | null;
  /** The clock watchdog's liveness; absent on an API older than the field. */
  clockGuard?: ClockGuard;
  serverTime: string;
  uptimeSeconds: number;
  checks: Record<string, 'up' | 'down'>;
  flags: Record<string, string>;
}

/** What one sweep did, per pass. Mirrors the API's `ReconciliationRun`. */
interface ReconciliationRun {
  finishedAt: string;
  durationMs: number;
  payments: { checked: number; settled: number; unpaid: number; failed: number } | null;
  recorded: { checked: number; replayed: number; skipped: number; failed: number } | null;
  identity: { checked: number; settled: number; pending: number; failed: number } | null;
  error: string | null;
}

/** The clock drift check as the API reports it. Mirrors the API's `ClockGuardReport`. */
interface ClockGuard {
  lastCheckedAt: string | null;
  observedDriftMs: number | null;
  stale: boolean;
}

/** The push queue as the API measures it. Mirrors the API's `PushBacklog`. */
interface PushBacklog {
  due: number;
  abandoned: number;
  oldestAt: string | null;
  oldestAgeSeconds: number | null;
  overdue: boolean;
}

/** The sweeper as this instance reports it. Mirrors the API's `ReconciliationStatus`. */
interface ReconciliationStatus {
  runs: number;
  inFlight: boolean;
  startedAt: string | null;
  lastRun: ReconciliationRun | null;
  consecutiveFailures: number;
  lastError: string | null;
  /**
   * The API's verdict that nothing has run for longer than an interval.
   *
   * Optional because it arrived with this field's release: an admin newer than
   * the API it reads must still render, and an older report is only as wrong as
   * it was before the timer could be judged.
   */
  stale?: boolean;
}

/** What each integration means for a member, so "down" is not a dead end. */
const INTEGRATIONS: { key: string; label: string; consequence: string }[] = [
  {
    key: 'identityVerification',
    label: 'Identity verification (Cashfree)',
    consequence: 'members cannot start an Aadhaar check, so nobody becomes discoverable',
  },
  { key: 'sms', label: 'SMS (MSG91)', consequence: 'sign-in codes cannot be delivered' },
  {
    key: 'email',
    label: 'Email (MSG91)',
    consequence: 'an email address cannot be added or changed, and no email is sent',
  },
  {
    key: 'push',
    label: 'Push (Firebase)',
    consequence: 'notifications still appear in the app list, but nothing is pushed to a device',
  },
  {
    key: 'payments',
    label: 'Payments (Razorpay)',
    consequence: 'no member can pay the setup fee or buy a contact unlock',
  },
  {
    key: 'paymentWebhooks',
    label: 'Payment webhooks (Razorpay)',
    consequence:
      'a payment can be taken and its unlock never granted - reconcile by hand until the secret is set',
  },
];

const FLAGS: { key: string; label: string }[] = [
  { key: 'aiRecommendations', label: 'AI recommendations (For You tab)' },
];

/** The commit as a person reads it: short enough to compare at a glance, full one on hover. */
function shortRevision(revision: string | null | undefined): string {
  return revision ? revision.slice(0, 7) : 'Unknown - not deployed from a commit';
}

/**
 * The sweep in a word, from the facts that distinguish its failure modes: it
 * stopped, it never started, it is running, or it is failing every interval.
 *
 * Stale is checked before `inFlight`, because a sweep that hung is still flagged
 * in flight — reporting "Running now" for it would be the same lie in a new place.
 */
function sweepState(sweep: ReconciliationStatus): { label: string; tone: 'done' | 'wip' } {
  if (sweep.stale) return { label: 'Stalled', tone: 'wip' };
  if (sweep.inFlight) return { label: 'Running now', tone: 'wip' };
  if (sweep.runs === 0) return { label: 'Never ran', tone: 'wip' };
  if (sweep.consecutiveFailures > 0) {
    return { label: `${sweep.consecutiveFailures} failing in a row`, tone: 'wip' };
  }
  return { label: 'Running normally', tone: 'done' };
}

/**
 * One row per pass that ran.
 *
 * The counts are worded rather than put in shared columns because the passes
 * count different things: an order nobody paid is "unpaid", a check the supplier
 * has not finished is "pending", and a delivery the live handler rejected is
 * "skipped". One column per meaning would be a table of half-empty cells.
 */
function sweepPasses(
  run: ReconciliationRun,
): { label: string; checked: number; outcome: string }[] {
  const passes: { label: string; checked: number; outcome: string }[] = [];
  if (run.payments) {
    passes.push({
      label: 'Payments (gateway)',
      checked: run.payments.checked,
      outcome: `${run.payments.settled} settled, ${run.payments.unpaid} unpaid, ${run.payments.failed} failed`,
    });
  }
  if (run.recorded) {
    passes.push({
      label: 'Recorded webhooks',
      checked: run.recorded.checked,
      outcome: `${run.recorded.replayed} replayed, ${run.recorded.skipped} skipped, ${run.recorded.failed} failed`,
    });
  }
  if (run.identity) {
    passes.push({
      label: 'Identity checks',
      checked: run.identity.checked,
      outcome: `${run.identity.settled} settled, ${run.identity.pending} pending, ${run.identity.failed} failed`,
    });
  }
  return passes;
}

function duration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} seconds`;
}

function humanSeconds(seconds: number): string {
  if (seconds < 90) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/**
 * The push queue in a word.
 *
 * "Not configured" comes first: without FCM credentials the dispatcher is
 * correctly a no-op, so a growing queue is the expected state and calling it
 * delayed would send somebody looking for a timer that is doing the right thing.
 */
function pushState(
  backlog: PushBacklog,
  configured: boolean,
): { label: string; tone: 'done' | 'wip' } {
  if (!configured) return { label: 'Not configured', tone: 'wip' };
  if (backlog.overdue) return { label: 'Delayed', tone: 'wip' };
  if (backlog.due === 0 && backlog.abandoned === 0) {
    return { label: 'Nothing queued', tone: 'done' };
  }
  return { label: 'Draining', tone: 'done' };
}

export default async function StatusPage() {
  const session = await currentAdmin();
  if (!holdsPermission(session, 'system:read')) {
    return (
      <>
        <h1>System status</h1>
        <div className="card">
          <p className="notice">
            This page reports which integrations and feature flags the deployment is configured for,
            which needs the <code>system:read</code> permission. Ask a Super Admin if you need it.
          </p>
        </div>
      </>
    );
  }

  let report: HealthReport | null = null;
  let error: string | null = null;
  try {
    // The permission-checked mirror of `/health/ready`. The public route stays
    // public for the deploy check and the smoke test; this one is the API's
    // decision about who may read the report.
    report = await adminFetch<HealthReport>('/admin/system/health');
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <h1>System status</h1>
      <p className="lede">
        Which integrations this deployment is configured for, read from the API it is running.
        Configuration is a deployment decision, so this page only reports it.
      </p>

      {error !== null ? <div className="error">{error}</div> : null}

      {report === null ? (
        <div className="card">
          <p className="notice">
            The API did not answer readiness. If the service is still waking up, reload in a moment;
            the repository&apos;s smoke test checks the same route.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Integrations</h2>
            <p className="notice">
              &quot;Configured&quot; means the API holds the credentials for that provider. It does
              not prove a send has ever been delivered, which only a real transaction shows.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Integration</th>
                  <th>State</th>
                  <th>What it means when off</th>
                </tr>
              </thead>
              <tbody>
                {INTEGRATIONS.map((integration) => {
                  const on = report?.checks[integration.key] === 'up';
                  return (
                    <tr key={integration.key}>
                      <td>{integration.label}</td>
                      <td>
                        <span className={`pill ${on ? 'done' : 'wip'}`}>
                          {on ? 'Configured' : 'Awaiting credentials'}
                        </span>
                      </td>
                      <td>{on ? '-' : integration.consequence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Feature flags</h2>
            <table>
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {FLAGS.map((flag) => (
                  <tr key={flag.key}>
                    <td>{flag.label}</td>
                    <td className="mono">{report?.flags[flag.key] ?? 'unknown'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="notice">
              A flag is declared in the deployment blueprint; changing it is a redeploy, not a
              switch here.
            </p>
          </div>

          <div className="card">
            <h2>Service</h2>
            <dl className="meta">
              <dt>Release</dt>
              <dd
                className="mono"
                title={typeof report.revision === 'string' ? report.revision : undefined}
              >
                {shortRevision(report.revision)}
              </dd>
              <dt>Readiness</dt>
              <dd>
                <span className={`pill ${report.status === 'ok' ? 'done' : 'wip'}`}>
                  {report.status}
                </span>
              </dd>
              <dt>Database</dt>
              <dd>{report.checks.database === 'up' ? 'Reachable' : 'Unreachable'}</dd>
              <dt>Server clock</dt>
              <dd>
                {report.checks.clock === 'up' ? 'Stable' : 'Jumped - expiry cannot be trusted'}
              </dd>
              <dt>Clock checked</dt>
              <dd>
                {report.clockGuard === undefined
                  ? 'Not reported by this API build'
                  : report.clockGuard.lastCheckedAt === null
                    ? 'Not yet'
                    : formatDateTime(report.clockGuard.lastCheckedAt)}
              </dd>
              <dt>Server time</dt>
              <dd>{formatDateTime(report.serverTime)}</dd>
              <dt>Running for</dt>
              <dd>{humanSeconds(report.uptimeSeconds)}</dd>
            </dl>
            {report.clockGuard?.stale ? (
              <p className="notice">
                The drift check has not run for longer than two intervals, so &quot;Stable&quot; is
                its last verdict rather than a current one. Restarting the API re-arms it; unlock
                expiry is priced against this clock.
              </p>
            ) : null}
          </div>

          <div className="card">
            <h2>Reconciliation sweep</h2>
            <p className="notice">
              The sweep repairs payments and identity checks whose webhook never arrived. Its
              failure mode is silence, so it reports what it last did here rather than only in the
              log.
            </p>
            {report.reconciliation === undefined ? (
              <p className="notice">This API build does not report its sweep yet.</p>
            ) : (
              <>
                <dl className="meta">
                  <dt>State</dt>
                  <dd>
                    <span className={`pill ${sweepState(report.reconciliation).tone}`}>
                      {sweepState(report.reconciliation).label}
                    </span>
                  </dd>
                  <dt>Last run</dt>
                  <dd>{formatDateTime(report.reconciliation.lastRun?.finishedAt)}</dd>
                  <dt>Took</dt>
                  <dd>
                    {report.reconciliation.lastRun === null
                      ? '-'
                      : duration(report.reconciliation.lastRun.durationMs)}
                  </dd>
                  <dt>Runs since start</dt>
                  <dd>{report.reconciliation.runs}</dd>
                  <dt>Consecutive failures</dt>
                  <dd>{report.reconciliation.consecutiveFailures}</dd>
                  <dt>Last error</dt>
                  <dd>{report.reconciliation.lastError ?? '-'}</dd>
                </dl>

                {report.reconciliation.stale ? (
                  <p className="notice">
                    No sweep for longer than one interval: the timer that starts it has probably
                    stopped, and restarting the API re-arms it.
                  </p>
                ) : null}

                {report.reconciliation.lastRun === null ? (
                  <p className="notice">No sweep has finished since this instance started.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Pass</th>
                        <th>Checked</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sweepPasses(report.reconciliation.lastRun).map((pass) => (
                        <tr key={pass.label}>
                          <td>{pass.label}</td>
                          <td>{pass.checked}</td>
                          <td>{pass.outcome}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>

          <div className="card">
            <h2>Push delivery</h2>
            <p className="notice">
              A push is written to the queue and delivered by a timer, so a dispatcher that has
              stopped leaves rows nobody notices: the member still has the in-app entry and no
              request fails.
            </p>
            {report.pushBacklog === undefined ? (
              <p className="notice">This API build does not report its push queue yet.</p>
            ) : report.pushBacklog === null ? (
              <p className="notice">
                The API could not read the push queue, so there is nothing to report here.
              </p>
            ) : (
              <>
                <dl className="meta">
                  <dt>State</dt>
                  <dd>
                    <span
                      className={`pill ${pushState(report.pushBacklog, report.checks.push === 'up').tone}`}
                    >
                      {pushState(report.pushBacklog, report.checks.push === 'up').label}
                    </span>
                  </dd>
                  <dt>Waiting</dt>
                  <dd>{report.pushBacklog.due}</dd>
                  <dt>Abandoned mid-send</dt>
                  <dd>{report.pushBacklog.abandoned}</dd>
                  <dt>Oldest waiting</dt>
                  <dd>
                    {report.pushBacklog.oldestAt === null
                      ? '-'
                      : `${formatDateTime(report.pushBacklog.oldestAt)} (${humanSeconds(
                          report.pushBacklog.oldestAgeSeconds ?? 0,
                        )})`}
                  </dd>
                </dl>

                {report.pushBacklog.overdue && report.checks.push === 'up' ? (
                  <p className="notice">
                    The oldest queued push has waited longer than a running dispatcher would allow,
                    so the timer that drains the queue has probably stopped. Restarting the API
                    re-arms it.
                  </p>
                ) : null}

                {report.checks.push !== 'up' ? (
                  <p className="notice">
                    Push is not configured on this deployment, so these rows are expected to wait
                    until FCM credentials are set.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
