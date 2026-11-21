import { Module } from '@nestjs/common';
import { ReconciliationStatusService } from './reconciliation-status.service';

/**
 * The sweeper's status, on its own.
 *
 * Split out from `ReconciliationModule` because the health module reads the
 * status and must not inherit the payments and verification graphs to do so —
 * the same reason `HealthModule` builds its gateways from factories rather than
 * importing their modules. One provider, no imports.
 */
@Module({
  providers: [ReconciliationStatusService],
  exports: [ReconciliationStatusService],
})
export class ReconciliationStatusModule {}
