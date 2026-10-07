import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Blocking, reporting and account deletion — sections 19, 20 and 21.
 *
 * They share a home because the read paths already treat them as one concern:
 * discovery's exclusions, the unlock guard and the visibility resolver all ask
 * "may these two accounts see each other?", and a block row or a deletion is
 * what answers it. Keeping it separate from `DiscoveryModule` avoids inverting
 * the dependency — discovery would otherwise need to import this module for a
 * single `none` clause it can express directly.
 *
 * The admin side of blocking and reporting (section 30's review queue) does not
 * live here: it is served by the admin API, which has its own authorisation
 * model and cannot import a module guarded by the user-facing `JwtAuthGuard`.
 *
 * `AuthModule` is imported for `JwtAuthGuard`, which needs `TokenService`, and
 * for `OtpService`, which account deletion consumes the DELETE_ACCOUNT code
 * from.
 */
@Module({
  imports: [AuthModule],
  controllers: [BlocksController, ReportsController, AccountDeletionController],
  providers: [BlocksService, ReportsService, AccountDeletionService],
  exports: [BlocksService, ReportsService, AccountDeletionService],
})
export class ModerationModule {}
