import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { ClockModule } from './common/clock/clock.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, ClockModule, PrismaModule, HealthModule],
})
export class AppModule {}
