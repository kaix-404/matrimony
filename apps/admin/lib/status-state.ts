/**
 * How the System status page words a queue's state, and the shapes it reads.
 *
 * These live here rather than in the page for one reason: they are pure
 * decisions, and a pure decision that only a server component can reach is a
 * decision nothing checks. The retention pill shipped saying "Up to date" above
 * a row counting deletions with no purge date, and no test could have caught it
 * because no test could call it.
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
 * The two alert states are checked first and stay the only ones. Undated rows do
 * not join them: the sweep erases them by their deletion date, so nothing is owed
 * and the check stays up. Calling that queue "Up to date" was the lie — the row
 * below the pill said otherwise. It is `done` because this describes the queue,
 * not a fault; the notice under the table is where the backfill and the
 * climbing-count signal live.
 */
export function retentionState(retention: AccountRetention): QueueState {
  if (retention.overdue) return { label: 'Overdue', tone: 'wip' };
  if (retention.due > 0) return { label: 'Due on the next sweep', tone: 'done' };
  const undated = retention.undated ?? 0;
  if (undated > 0) {
    return { label: `${undated} deleted with no purge date`, tone: 'done' };
  }
  return { label: 'Up to date', tone: 'done' };
}
