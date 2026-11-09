import { Module } from '@nestjs/common';
import {
  createVerificationGateway,
  VerificationGateway,
} from '../verification/verification.gateway';
import { HealthController } from './health.controller';

/**
 * Readiness reports whether identity verification is configured, which needs the
 * gateway but nothing else from its module.
 *
 * Importing `VerificationModule` here would also load `AuthModule` and its token
 * factory into every bootstrap, including the rate-limit test that boots a small
 * slice of the app with a deliberately minimal environment. The factory keeps
 * that slice small and still uses one definition of how the vendor is built.
 */
@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: VerificationGateway,
      inject: ['ENV'],
      useFactory: createVerificationGateway,
    },
  ],
})
export class HealthModule {}
