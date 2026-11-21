/**
 * The push dispatcher's cadence, and the limits that decide what "due" means.
 *
 * Shared with the health report, which measures the queue against the same
 * numbers the dispatcher drains it with: a check that carried its own copy would
 * eventually either call a healthy queue stuck or miss a stopped dispatcher.
 */

/** How often the dispatcher looks for queued pushes. */
export const PUSH_DISPATCH_INTERVAL_MS = 60_000;

/** A `SENDING` row older than this is assumed abandoned and requeued. */
export const PUSH_SENDING_STALE_MS = 5 * 60_000;

/** After this many failed attempts a row stops being retried. */
export const PUSH_MAX_ATTEMPTS = 5;

/**
 * How old a due push may be before the queue is reported as stuck.
 *
 * A running dispatcher picks up anything due within one interval, so five
 * intervals is not a slow sweep — it is a dispatcher that is not running.
 */
export const PUSH_BACKLOG_STALE_AFTER_MS = 5 * PUSH_DISPATCH_INTERVAL_MS;
