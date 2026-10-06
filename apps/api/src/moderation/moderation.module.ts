import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

/**
 * Blocking — section 19, with reporting and the deletion flows of sections 20
 * and 21 still to come.
 *
 * It shares a home with those because the read paths already treat blocking as
 * one concern: discovery's exclusions, the unlock guard and the visibility
 * resolver all ask "may these two accounts see each other?", and a block row is
 * what answers it. Keeping this out of `DiscoveryModule` avoids inverting the
 * dependency — discovery would otherwise need to import this module for a
 * single `none` clause it can express directly.
 *
 * `AuthModule` is imported for `JwtAuthGuard`, which needs `TokenService` from
 * the module that declares the controller.
 */
@Module({
  imports: [AuthModule],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class ModerationModule {}
