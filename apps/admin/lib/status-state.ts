/**
 * How the System status page words a queue's state and the values it prints,
 * plus the shapes it reads.
 *
 * These live here rather than in the page for one reason: they are pure
 * decisions, and a pure decision that only a server component can reach is a
 * decision nothing checks. The retention pill shipped saying "Up to date" above
 * a row counting deletions with no purge date, and no test could have caught it
 * because no test could call it. `next build` type-checks the page and proves
 * nothing about what it says.
 *
 * A label and a tone, not a colour: `done` is a fact the deployment is fine
 * with, `wip` is something that is not where it should be. Neither is an alert —
 * readiness and the alert probe read the payload, not the card.
 */

/** What one sweep did, per pass. Mirrors the API's `ReconciliationRun`. */
export interface ReconciliationRun {
  finishedAt: string;
  durationMs: number;
  payments: { checked: number; settled: number; unpaid: number; failed: number } | null;
  recorded: { checked: number; replayed: number; skipped: number; failed: number } | null;
  identity: { checked: number; settled: number; pending: number; failed: number } | null;
  error: string | null;
}

/** The retention queue as the API measures it. Mirrors the API's `AccountRetentionReport`. */
export interface AccountRetention {
  due: number;
  /**
   * Deleted accounts with no purge date at all.
   *
   * Optional because it arrived with this field's release: an admin newer than
   * the API it reads must still render, and the row shows `-` rather than
   * claiming there are none.
   */
  undated?: number;
  oldestDueAt: string | null;
  oldestOverdueSeconds: number | null;
  overdue: boolean;
}

/** The push queue as the API measures it. Mirrors the API's `PushBacklog`. */
export interface PushBacklog {
  due: number;
  abandoned: number;
  oldestAt: string | null;
  oldestAgeSeconds: number | null;
  overdue: boolean;
}

/** The sweeper as this instance reports it. Mirrors the API's `ReconciliationStatus`. */
export interface ReconciliationStatus {
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

/** A state as the card renders it: the words, and whether they are a warning. */
export interface QueueState {
  label: string;
  tone: 'done' | 'wip';
}

/**
 * The sweep in a word, from the facts that distinguish its failure modes: it
 * stopped, it never started, it is running, or it is failing every interval.
 *
 * Stale is checked before `inFlight`, because a sweep that hung is still flagged
 * in flight — reporting "Running now" for it would be the same lie in a new place.
 */
export function sweepState(sweep: ReconciliationStatus): QueueState {
  if (sweep.stale) return { label: 'Stalled', tone: 'wip' };
  if (sweep.inFlight) return { label: 'Running now', tone: 'wip' };
  if (sweep.runs === 0) return { label: 'Never ran', tone: 'wip' };
  if (sweep.consecutiveFailures > 0) {
    return { label: `${sweep.consecutiveFailures} failing in a row`, tone: 'wip' };
  }
  return { label: 'Running normally', tone: 'done' };
}

/**
 * The push queue in a word.
 *
 * "Not configured" comes first: without FCM credentials the dispatcher is
 * correctly a no-op, so a growing queue is the expected state and calling it
 * delayed would send somebody looking for a timer that is doing the right thing.
 */
export function pushState(backlog: PushBacklog, configured: boolean): QueueState {
  if (!configured) return { label: 'Not configured', tone: 'wip' };
  if (backlog.overdue) return { label: 'Delayed', tone: 'wip' };
  if (backlog.due === 0 && backlog.abandoned === 0) {
    return { label: 'Nothing queued', tone: 'done' };
  }
  return { label: 'Draining', tone: 'done' };
}

/**
 * The erasure queue in a word.
 *
 * "Due on the next sweep" is the normal state for anything overdue by less than
 * two intervals: the sweep runs every six hours, so a deadline that passed this
 * morning is not yet a fault.
 *
 * Undated rows are `wip`: nothing is owed on them, but they should not exist at
 * all. Expected state is zero, and a non-zero count fails the same health check
 * that reports overdue rows, so the pill and `/health/alerts` agree. Calling the
 * queue "Up to date" here was the lie — the row below the pill said otherwise.
 * The notice under the table is where the backfill and the climbing-count signal
 * live.
 */
export function retentionState(retention: AccountRetention): QueueState {
  if (retention.overdue) return { label: 'Overdue', tone: 'wip' };
  if (retention.due > 0) return { label: 'Due on the next sweep', tone: 'done' };
  const undated = retention.undated ?? 0;
  if (undated > 0) {
    return { label: `${undated} deleted with no purge date`, tone: 'wip' };
  }
  return { label: 'Up to date', tone: 'done' };
}

/**
 * One row per pass that ran.
 *
 * The counts are worded rather than put in shared columns because the passes
 * count different things: an order nobody paid is "unpaid", a check the supplier
 * has not finished is "pending", and a delivery the live handler rejected is
 * "skipped". One column per meaning would be a table of half-empty cells.
 */
export function sweepPasses(
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

/** A duration as the card prints it: milliseconds below a second, seconds above. */
export function duration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} seconds`;
}

/**
 * A span of seconds in the largest unit that stays a small number.
 *
 * Rounded rather than truncated: these are ages read at a glance, and "2 hours"
 * for 5400 seconds is the answer a person wants, not "1 hour".
 */
export function humanSeconds(seconds: number): string {
  if (seconds < 90) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** The commit as a person reads it: short enough to compare at a glance, full one on hover. */
export function shortRevision(revision: string | null | undefined): string {
  return revision ? revision.slice(0, 7) : 'Unknown - not deployed from a commit';
}
