import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClockModule } from '../common/clock/clock.module';
import { StorageModule } from '../storage/storage.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UnlockService } from './unlock.service';
import { UnlockExpirySweeper } from './unlock-expiry.sweeper';
import { UnlockExpiryReminder } from './unlock-expiry-reminder.service';
import { ProfilesController, UnlocksController } from './unlock.controller';

/**
 * Unlock delivery: the read side of Phase 4.
 *
 * Sits apart from `PaymentsModule` on purpose. Payments decides whether money
 * arrived; this module decides what the payment bought. Keeping them separate
 * means the authorisation rules for a paid profile are stated once, here, rather
 * than inferred from whichever handler happens to be in front of the profile.
 *
 * `DiscoveryModule` is imported for `VisibilityPreferenceService`, so a profile
 * is scoped here by exactly the rule the feed used. Re-deriving visibility would
 * be the most likely way for a paid feature to end up showing a profile that the
 * free feed would have hidden.
 *
 * `NotificationsModule` is imported for the section 15 reminder. It already
 * imports `AuthModule`, so importing it back here adds no cycle — this module
 * only reaches `NotificationsService`, never the other way round.
 */
@Module({
  imports: [AuthModule, ClockModule, StorageModule, DiscoveryModule, NotificationsModule],
  controllers: [UnlocksController, ProfilesController],
  providers: [UnlockService, UnlockExpirySweeper, UnlockExpiryReminder],
  // Exported so an admin reconciliation job or a later phase can expire a
  // single unlock without reaching into the controller layer.
  exports: [UnlockService],
})
export class UnlockModule {}
