/**
 * Which health checks are worth waking somebody for.
 *
 * `/health/ready` reports two different kinds of `down`, and alerting on both
 * would be worse than alerting on neither:
 *
 * - A **broken** check: the database is unreachable, the clock jumped, a timer
 *   that repairs something has stopped. Nobody can fix these by waiting, and
 *   their failure mode is silence.
 * - A **not configured** check: `email` on a deployment whose MSG91 credentials
 *   have not been entered yet, `identityVerification` before Cashfree approves
 *   the account. These are known deployment states, reported on the console so a
 *   smoke test can tell them apart from a vendor rejection. An alert that fires
 *   every half hour until somebody signs a contract is an alert that gets
 *   filtered, taking the real ones with it.
 *
 * The provider checks are therefore deliberately absent. Everything listed here
 * means something stopped that used to work, or never started when it should
 * have.
 */
export const ALERTED_CHECKS = [
  'database',
  'clock',
  'clockGuard',
  'reconciliation',
  'pushDispatch',
  'accountRetention',
] as const;

export type AlertedCheck = (typeof ALERTED_CHECKS)[number];

/**
 * The alertable subset of a health report.
 *
 * Deliberately narrower than `HealthReport`: no counts, no backlog ages, no
 * provider configuration, no revision. This is served without a session so an
 * external prober can poll it, and an unauthenticated caller has no business
 * learning how many accounts are overdue or which providers are configured. The
 * names of the checks that are down are enough to act on, and the console remains
 * the place where the detail lives.
 */
export interface HealthAlertReport {
  status: 'ok' | 'down';
  /** Alerted checks that are down, in the order they are listed above. */
  down: AlertedCheck[];
  /** Server time of the report this was derived from. */
  checkedAt: string;
}

/**
 * Reduce a health report to what an alert needs.
 *
 * A check absent from the map is not down: an API older than a check cannot
 * report it, and paging for a field a rollback removed would make the prober the
 * reason nobody trusts the alerts. Absence is skew, not failure.
 */
export function buildAlertReport(
  checks: Record<string, 'up' | 'down'>,
  checkedAt: string,
): HealthAlertReport {
  const down = ALERTED_CHECKS.filter((check) => checks[check] === 'down');
  return {
    status: down.length === 0 ? 'ok' : 'down',
    down,
    checkedAt,
  };
}
