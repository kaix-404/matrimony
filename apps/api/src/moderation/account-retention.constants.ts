/**
 * How often the retention sweep reads `purgeAfter`, and when a missed purge
 * counts as a stopped timer.
 *
 * Shared rather than private to the sweeper: the health report judges the same
 * deadline against the same cadence, and two copies of "six hours" would
 * eventually disagree about whether the sweep is running.
 */

/**
 * Six hours: the work is bulk erasure of a handful of rows a day, and the
 * earliest a missed sweep matters is a day of retention overrun on an account
 * that is already invisible.
 */
export const ACCOUNT_RETENTION_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * How overdue an account may be before the retention path is reported as
 * stopped.
 *
 * A row that becomes due just after a pass legitimately waits almost a full
 * interval. Two intervals means two passes in a row did not happen — the timer
 * is not running, not merely slow — and by then the overrun is a compliance
 * question rather than a scheduling one.
 */
export const ACCOUNT_RETENTION_OVERDUE_AFTER_MS = 2 * ACCOUNT_RETENTION_INTERVAL_MS;
