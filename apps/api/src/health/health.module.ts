import { Module } from '@nestjs/common';
import {
  createVerificationGateway,
  VerificationGateway,
} from '../verification/verification.gateway';
import { SmsModule } from '../sms/sms.module';
import { EmailModule } from '../email/email.module';
import { PushModule } from '../push/push.module';
import { HealthController } from './health.controller';

/**
 * Readiness reports whether identity verification and the three delivery
 * providers are configured, which needs those gateways and nothing else.
 *
 * `SmsModule`, `EmailModule` and `PushModule` are leaf modules with no imports of
 * their own, so taking the gateways from them keeps this cheap; the comment below
 * explains why identity verification is built from a factory instead.
 *
 * Importing `VerificationModule` here would also load `AuthModule` and its token
 * factory into every bootstrap, including the rate-limit test that boots a small
 * slice of the app with a deliberately minimal environment. The factory keeps
 * that slice small and still uses one definition of how the vendor is built.
 */
@Module({
  imports: [SmsModule, EmailModule, PushModule],
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
