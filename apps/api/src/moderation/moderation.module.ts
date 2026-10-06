import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Blocking and reporting — sections 19 and 20, with the deletion flows of
 * section 21 still to come.
 *
 * They share a home because the read paths already treat them as one concern:
 * discovery's exclusions, the unlock guard and the visibility resolver all ask
 * "may these two accounts see each other?", and blocking is the row that answers
 * it. Keeping it separate from `DiscoveryModule` avoids inverting the dependency
 * — discovery would otherwise need to import this module for a single `none`
 * clause it can express directly.
 *
 * The admin side of both (section 30's review queue) does not live here: it is
 * served by the admin API, which has its own authorisation model and cannot
 * import a module guarded by the user-facing `JwtAuthGuard`.
 *
 * `AuthModule` is imported for `JwtAuthGuard`, which needs `TokenService` from
 * the module that declares the controller.
 */
@Module({
  imports: [AuthModule],
  controllers: [BlocksController, ReportsController],
  providers: [BlocksService, ReportsService],
  exports: [BlocksService, ReportsService],
})
export class ModerationModule {}
