import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { PhotoService } from './photo.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

/**
 * `MasterDataModule` is imported for `MasterDataService`, which resolves the
 * master-list ids a profile save submits. The dependency runs one way: profiles
 * depend on master data, never the reverse.
 *
 * `AuthModule` is imported for the guard behind `@UseGuards(JwtAuthGuard)`. A
 * guard is instantiated in the context of the controller that declares it, so
 * without this import Nest would try to build it inside `ProfileModule` and fail
 * to find `TokenService` — every authenticated controller has to import the
 * auth module for the same reason.
 *
 * `StorageService` needs no import — `StorageModule` is global.
 */
@Module({
  imports: [AuthModule, MasterDataModule],
  controllers: [ProfileController],
  providers: [ProfileService, PhotoService],
  exports: [ProfileService],
})
export class ProfileModule {}
