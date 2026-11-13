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
  serverTime: string;
  uptimeSeconds: number;
  checks: Record<string, 'up' | 'down'>;
  flags: Record<string, string>;
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

function uptime(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.round(minutes / 60)} hours`;
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
              <dt>Server time</dt>
              <dd>{formatDateTime(report.serverTime)}</dd>
              <dt>Running for</dt>
              <dd>{uptime(report.uptimeSeconds)}</dd>
            </dl>
          </div>
        </>
      )}
    </>
  );
}
