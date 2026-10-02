import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';

/**
 * Exports `MasterDataService` because the profile service resolves submitted
 * master-list ids through it. The dependency runs one way only — profiles know
 * about lists, lists know nothing about profiles — so a new list never needs a
 * profile change and the two cannot deadlock each other's module resolution.
 */
@Module({
  controllers: [MasterDataController],
  providers: [MasterDataService],
  exports: [MasterDataService],
})
export class MasterDataModule {}
