import { Module } from '@nestjs/common';
import { VerificationModule } from '../verification/verification.module';
import { HealthController } from './health.controller';

@Module({
  imports: [VerificationModule],
  controllers: [HealthController],
})
export class HealthModule {}
