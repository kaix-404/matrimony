import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  PaymentsService,
  type PaymentReconcileSummary,
  type RecordedReconcileSummary,
} from '../payments/payments.service';
import {
  VerificationService,
  type VerificationReconcileSummary,
} from '../verification/verification.service';
import { ReconciliationStatusService } from './reconciliation-status.service';
import { RECONCILIATION_SWEEP_INTERVAL_MS } from './reconciliation.schedule';

/**
 * Asks the providers what they recorded that this API never wrote.
 *
 * The problem this exists for is the deployment rather than the code: the API
 * runs on Render's free plan, where an instance that has had no traffic for
 * fifteen minutes is stopped and the next request — a Razorpay capture webhook,
 * a DigiLocker callback — waits for a cold start that runs migrations and the
 * demo seed before Nest answers. Cashfree and Razorpay both retry, but their
 * retry windows are shorter than that boot, so the settlement happens at the
 * provider and nothing records it here: money taken and no unlock, or an
 * identity check that passed and a member still told to verify.
 *
 * A webhook cannot repair that, because the webhook is the thing that was lost.
 * So this is the compensating read: the same provider APIs that would have sent
 * the event, asked directly for anything still outstanding.
 *
 * There is a cheaper repair for the half of that failure which never reached the
 * vendor at all: a delivery that got far enough to be recorded in `WebhookEvent`
 * and then lost its handler — a crash between the insert and the settlement, or
 * a process killed mid-transaction. Those rows are already in this database and
 * carry the full payload, so the sweep replays them through the same handler the
 * live webhook uses. That pass needs no vendor call, which is why it still
 * recovers payments while Cashfree refuses this host's IPs.
 *
 * Two properties matter. It runs at boot as well as on an interval, because a
 * sleeping instance's first chance to act is the boot itself — a sweep that only
 * ran on a timer would leave a member waiting up to a full interval for a state
 * the database could already be told. And one pass failing must not stop the
 * others: Cashfree currently refuses this deployment's IPs, so its half will
 * often fail while Razorpay's halves — the read and the replay — are exactly the
 * parts that matter.
 *
 * A timer rather than a cron dependency, like the other sweepers here: no new
 * package, and a failure is caught and logged instead of becoming an uncaught
 * exception inside `setInterval`. `unref()` so a pending sweep never holds the
 * process open on shutdown.
 *
 * Every finished sweep writes its counts to `ReconciliationStatusService`, which
 * the health report renders: "the sweep died at boot" and "the sweep has failed
 * nine times running" are then facts on `/health/ready`, not something only the
 * log knows.
 */
@Injectable()
export class ProviderReconciliationSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProviderReconciliationSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  /** True while a sweep is in flight; guards against overlapping runs. */
  private sweeping = false;

  constructor(
    private readonly payments: PaymentsService,
    private readonly verifications: VerificationService,
    private readonly status: ReconciliationStatusService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.safeSweep('scheduled');
    }, RECONCILIATION_SWEEP_INTERVAL_MS);
    this.timer.unref();
    // The boot sweep is the one that matters on this plan: it is the first
    // moment after a wake-up at which anything can be reconciled.
    void this.safeSweep('startup');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * `startup` only changes the logging: the boot sweep always leaves one line,
   * even with nothing outstanding, so an operator can tell from the log that the
   * recovery path ran rather than being silently skipped.
   */
  private async safeSweep(reason: 'startup' | 'scheduled'): Promise<void> {
    // One sweep at a time. Every vendor read has its own ceiling, so a sweep
    // should finish inside its interval — but a provider that stops answering
    // is exactly the case where it might not, and a second sweep starting on the
    // same rows would multiply the hung calls instead of recovering anything.
    // Skipped rather than queued: the next tick reads the same state anyway.
    if (this.sweeping) {
      this.logger.warn('[reconcile] previous sweep is still running; skipping this one.');
      return;
    }
    this.sweeping = true;
    const startedAtMs = Date.now();
    this.status.begin(new Date(startedAtMs));

    let payments: PaymentReconcileSummary | null = null;
    let recorded: RecordedReconcileSummary | null = null;
    let identity: VerificationReconcileSummary | null = null;
    let error: string | null = null;

    try {
      const read = await this.run('payments', () => this.payments.reconcilePending());
      payments = read.summary;
      error ??= read.error;

      // Before the vendor read rather than after: this pass settles what is
      // already in our own table, and doing it first means a replay can never
      // race the read for the same capture in one sweep.
      const replay = await this.run('recorded events', () =>
        this.payments.replayRecordedWebhooks(),
      );
      recorded = replay.summary;
      error ??= replay.error;

      const checks = await this.run('identity', () => this.verifications.reconcilePending());
      identity = checks.summary;
      error ??= checks.error;

      if (reason !== 'startup') return;

      this.logger.log(
        `[reconcile] startup sweep — payments: ${describePayments(payments)}; ` +
          `events: ${describeRecorded(recorded)}; identity: ${describeVerifications(identity)}`,
      );
    } catch (unexpected) {
      // `run` catches everything the passes throw; this is the guard for a bug
      // in the composition itself, so one broken release cannot leave the sweep
      // pretending it completed.
      error = unexpected instanceof Error ? unexpected.message : String(unexpected);
      this.logger.error(
        '[reconcile] sweep failed unexpectedly.',
        unexpected instanceof Error ? unexpected.stack : String(unexpected),
      );
    } finally {
      // Released even when a pass throws, or one failure would wedge every later
      // sweep for the life of the process. `finish` also releases the in-flight
      // flag the health report reads.
      this.status.finish({
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        payments,
        recorded,
        identity,
        error,
      });
      this.sweeping = false;
    }
  }

  private async run<T>(
    label: 'payments' | 'recorded events' | 'identity',
    work: () => Promise<T>,
  ): Promise<{ summary: T | null; error: string | null }> {
    try {
      return { summary: await work(), error: null };
    } catch (error) {
      const code = (error as Error & { code?: string })?.code ?? '';
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[reconcile] ${label} sweep failed; will retry on the next interval.${code ? ` [${code}]` : ''}`,
        error instanceof Error ? error.stack : String(error),
      );
      return { summary: null, error: message };
    }
  }
}

function describePayments(summary: PaymentReconcileSummary | null): string {
  if (!summary) return 'failed';
  return `${summary.checked} due, ${summary.settled} settled, ${summary.unpaid} unpaid, ${summary.failed} errors`;
}

function describeRecorded(summary: RecordedReconcileSummary | null): string {
  if (!summary) return 'failed';
  return `${summary.checked} unprocessed, ${summary.replayed} replayed, ${summary.skipped} need a human, ${summary.failed} errors`;
}

function describeVerifications(summary: VerificationReconcileSummary | null): string {
  if (!summary) return 'failed';
  return `${summary.checked} due, ${summary.settled} applied, ${summary.pending} unfinished, ${summary.failed} errors`;
}
