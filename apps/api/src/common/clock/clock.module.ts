import { Global, Module } from '@nestjs/common';
import { ClockDriftGuard, ClockService } from './clock.service';

@Global()
@Module({
  providers: [ClockService, ClockDriftGuard],
  exports: [ClockService, ClockDriftGuard],
})
export class ClockModule {}
