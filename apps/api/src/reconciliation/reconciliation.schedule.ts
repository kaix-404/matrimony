/**
 * How often the sweeper runs, and when a silent timer counts as stopped.
 *
 * Shared rather than private to the sweeper: the health report judges the same
 * timestamps against the interval the timer is armed with, and two copies of
 * "ten minutes" would eventually disagree about whether the sweep is alive.
 */

/**
 * Ten minutes: long enough that a member who pays and waits is settled within one
 * interval, short enough that the vendor read is not a poll. The charge is
 * bounded by `RECONCILE.batch` in each pass, so a sweep with nothing outstanding
 * costs three indexed queries and no vendor calls.
 */
export const RECONCILIATION_SWEEP_INTERVAL_MS = 10 * 60_000;

/**
 * How old the last sweep may be before it is reported as stopped.
 *
 * A healthy finish is at most one interval old, so the extra minute only has to
 * absorb a timer that fires late. It is not slack for a long sweep: a sweep still
 * running is judged from when it started.
 */
export const RECONCILIATION_STALE_AFTER_MS = RECONCILIATION_SWEEP_INTERVAL_MS + 60_000;
