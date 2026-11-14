import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { UnlockModule } from '../unlock/unlock.module';
import { MatchesController, ShortlistController } from './shortlist.controller';
import { ShortlistService } from './shortlist.service';

/**
 * Shortlisting and the Matches list.
 *
 * `UnlockModule` is imported for two reasons: `assertViewable` is the guard a
 * bookmark shares with a profile view, and the matches list is built from
 * `listUnlocks` rather than from a second query against `ContactUnlock` that
 * would have to re-implement the expiry and admin-grant rules. One reader of
 * that table, one set of rules.
 */
@Module({
  imports: [AuthModule, StorageModule, UnlockModule],
  controllers: [ShortlistController, MatchesController],
  providers: [ShortlistService],
})
export class ShortlistModule {}
