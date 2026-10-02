import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { StorageService } from './s3.service';

/**
 * Global because photos are read from several places — the owner's profile view,
 * the locked preview in discovery, the unlocked response — and each of them
 * needs to mint a presigned URL. Scoping the provider per module would mean
 * re-declaring it in every consumer, and the one that forgot would fail at
 * runtime rather than at boot.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
