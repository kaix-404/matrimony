import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { VerificationModule } from '../verification/verification.module';
import { ProviderReconciliationSweeper } from './provider-reconciliation.sweeper';

/**
 * Recovery for webhooks that never arrived.
 *
 * Both services export themselves for other callers already (`PaymentsService`
 * for the unlock guard, `VerificationService` for the admin console), so this
 * module owns nothing but the sweep that drives them. Keeping it separate rather
 * than hanging the timer off either service is what lets one provider being
 * unreachable — Cashfree refusing this host's IPs, say — be visible without
 * disabling the other's recovery.
 */
@Module({
  imports: [PaymentsModule, VerificationModule],
  providers: [ProviderReconciliationSweeper],
})
export class ReconciliationModule {}
