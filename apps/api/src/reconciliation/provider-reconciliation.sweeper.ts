import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PaymentsService, type PaymentReconcileSummary } from '../payments/payments.service';
import {
  VerificationService,
  type VerificationReconcileSummary,
} from '../verification/verification.service';

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
 * Two properties matter. It runs at boot as well as on an interval, because a
 * sleeping instance's first chance to act is the boot itself — a sweep that only
 * ran on a timer would leave a member waiting up to a full interval for a state
 * the database could already be told. And one provider failing must not stop the
 * other: Cashfree currently refuses this deployment's IPs, so its half will
 * often fail while Razorpay's half is exactly the half that matters.
 *
 * A timer rather than a cron dependency, like the other sweepers here: no new
 * package, and a failure is caught and logged instead of becoming an uncaught
 * exception inside `setInterval`. `unref()` so a pending sweep never holds the
 * process open on shutdown.
 */
@Injectable()
export class ProviderReconciliationSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  /**
   * Ten minutes: long enough that a member who pays and waits is settled within
   * one interval, short enough that the vendor read is not a poll. The charge is
   * bounded by `RECONCILE.batch` in each service, so a sweep with nothing
   * outstanding costs two indexed queries and no vendor calls.
   */
  private static readonly SWEEP_INTERVAL_MS = 10 * 60_000;

  private readonly logger = new Logger(ProviderReconciliationSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  /** True while a sweep is in flight; guards against overlapping runs. */
  private sweeping = false;

  constructor(
    private readonly payments: PaymentsService,
    private readonly verifications: VerificationService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.safeSweep('scheduled');
    }, ProviderReconciliationSweeper.SWEEP_INTERVAL_MS);
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

    try {
      const payments = await this.runPayments();
      const identity = await this.runVerifications();

      if (reason !== 'startup') return;

      this.logger.log(
        `[reconcile] startup sweep — payments: ${describePayments(payments)}; ` +
          `identity: ${describeVerifications(identity)}`,
      );
    } finally {
      // Released even when a provider run throws, or one failure would wedge
      // every later sweep for the life of the process.
      this.sweeping = false;
    }
  }

  private async runPayments(): Promise<PaymentReconcileSummary | null> {
    try {
      return await this.payments.reconcilePending();
    } catch (error) {
      const code = (error as Error & { code?: string })?.code ?? '';
      this.logger.error(
        `[reconcile] payments sweep failed; will retry on the next interval.${code ? ` [${code}]` : ''}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  private async runVerifications(): Promise<VerificationReconcileSummary | null> {
    try {
      return await this.verifications.reconcilePending();
    } catch (error) {
      const code = (error as Error & { code?: string })?.code ?? '';
      this.logger.error(
        `[reconcile] identity sweep failed; will retry on the next interval.${code ? ` [${code}]` : ''}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}

function describePayments(summary: PaymentReconcileSummary | null): string {
  if (!summary) return 'failed';
  return `${summary.checked} due, ${summary.settled} settled, ${summary.unpaid} unpaid, ${summary.failed} errors`;
}

function describeVerifications(summary: VerificationReconcileSummary | null): string {
  if (!summary) return 'failed';
  return `${summary.checked} due, ${summary.settled} applied, ${summary.pending} unfinished, ${summary.failed} errors`;
}
