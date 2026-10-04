import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { VisibilityPreferenceService } from './visibility-preference.service';
import { VisibilityPreferenceController } from './visibility-preference.controller';
import { DiscoveryService } from './discovery.service';
import { DiscoveryController } from './discovery.controller';

/**
 * Discovery and the two-way visibility preferences it depends on.
 *
 * Both live in one module because discovery reads the preference resolver
 * directly; splitting them would mean exporting the resolver from one module and
 * importing it into the other for no isolation benefit.
 *
 * `VisibilityPreferenceService` is exported so later phases (unlock ordering,
 * unlock listing) can price a target the same way discovery does, rather than
 * re-deriving the scope.
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [VisibilityPreferenceController, DiscoveryController],
  providers: [VisibilityPreferenceService, DiscoveryService],
  exports: [VisibilityPreferenceService],
})
export class DiscoveryModule {}