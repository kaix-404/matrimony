import { Injectable } from '@nestjs/common';
import type {
  PaymentReconcileSummary,
  RecordedReconcileSummary,
} from '../payments/payments.service';
import type { VerificationReconcileSummary } from '../verification/verification.service';
import { RECONCILIATION_STALE_AFTER_MS } from './reconciliation.schedule';

/** Everything one sweep did, kept so a reader can see it without the log. */
export interface ReconciliationRun {
  finishedAt: string;
  durationMs: number;
  payments: PaymentReconcileSummary | null;
  /** The recorded-webhook pass: recoveries that needed no vendor call. */
  recorded: RecordedReconcileSummary | null;
  identity: VerificationReconcileSummary | null;
  /** Set when any pass threw, so one broken pass is visible from outside. */
  error: string | null;
}

/** What is stored: the timestamps plus the counters. `stale` is derived from them. */
type StoredStatus = Omit<ReconciliationStatus, 'stale'>;

/**
 * When the sweeper was last seen doing anything: when the current sweep started
 * while one is running, otherwise when the last one finished.
 *
 * The start is the right marker for a sweep in flight because a hung vendor call
 * would otherwise read as "running" for the life of the process.
 */
function lastActivityAt(state: StoredStatus): number | null {
  const at = state.inFlight ? state.startedAt : state.lastRun?.finishedAt;
  if (!at) return null;
  const parsed = Date.parse(at);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The sweeper's own state, as the health report and the console read it.
 *
 * Exists because the failure this whole module repairs is silence: a sweeper
 * that never ran, or one failing every ten minutes, used to be indistinguishable
 * from a healthy one unless somebody went and grepped the log. `runs: 0` after a
 * boot is the fact that says "the recovery path did not start",
 * `consecutiveFailures` is what turns an unchanging error line into a state, and
 * `stale` is what tells a sweep that stopped from one that is still ticking.
 *
 * Holds no dependencies on purpose. It is imported by the health module, which
 * deliberately avoids dragging `PaymentsModule` and `VerificationModule` into
 * every bootstrap that only wants to answer whether the instance is ready.
 */
@Injectable()
export class ReconciliationStatusService {
  private status: StoredStatus = {
    runs: 0,
    inFlight: false,
    startedAt: null,
    lastRun: null,
    consecutiveFailures: 0,
    lastError: null,
  };

  /** A sweep has started; it is now in flight until `finish` is called. */
  begin(startedAt: Date): void {
    this.status = { ...this.status, inFlight: true, startedAt: startedAt.toISOString() };
  }

  /**
   * A sweep ended, whatever it achieved.
   *
   * `consecutiveFailures` counts sweeps in which *any* pass threw, and resets on
   * the first sweep where none did — that is what lets an alert (or a reader of
   * the health payload) tell "one bad sweep" from "the vendor has refused us
   * every ten minutes since Tuesday".
   */
  finish(run: ReconciliationRun): void {
    this.status = {
      runs: this.status.runs + 1,
      inFlight: false,
      startedAt: this.status.startedAt,
      lastRun: run,
      consecutiveFailures: run.error ? this.status.consecutiveFailures + 1 : 0,
      // Kept after a recovery: "it failed, then it worked" is the more useful
      // history, and `consecutiveFailures: 0` already says it recovered.
      lastError: run.error ?? this.status.lastError,
    };
  }

  /**
   * A copy, so a reader cannot mutate the sweeper's state by holding it.
   *
   * `stale` is judged here rather than recorded in `finish`, because "the timer
   * stopped" is a fact about the time since the last sweep, not about the sweep
   * itself: a boolean stored at finish time would be wrong from the moment it was
   * written. Deriving it in one place also keeps the API's `checks.reconciliation`
   * and the console's pill from reaching different verdicts.
   */
  snapshot(now: Date = new Date()): ReconciliationStatus {
    const activity = lastActivityAt(this.status);
    return {
      ...structuredClone(this.status),
      stale: activity !== null && now.getTime() - activity > RECONCILIATION_STALE_AFTER_MS,
    };
  }
}

export interface ReconciliationStatus {
  /** Sweeps that have finished since this process started. */
  runs: number;
  inFlight: boolean;
  startedAt: string | null;
  lastRun: ReconciliationRun | null;
  /** Sweeps in a row that completed with at least one pass throwing. */
  consecutiveFailures: number;
  lastError: string | null;
  /**
   * Nothing has started or finished for longer than an interval, so the timer
   * that runs the sweep is presumed stopped. True while a sweep has also been in
   * flight longer than that, which means it is wedged rather than working.
   */
  stale: boolean;
}
