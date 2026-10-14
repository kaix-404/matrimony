import { Module } from '@nestjs/common';
import { SmsGateway, Msg91SmsGateway } from './sms.gateway';
import type { Env } from '../config/env';

/**
 * SMS delivery (section 6).
 *
 * A module of its own rather than a provider inside `AuthModule` or
 * `NotificationsModule`, because both need it and `NotificationsModule` already
 * imports `AuthModule`: declaring the gateway in `AuthModule` would make the
 * notifications module pull it transitively, and declaring it in
 * `NotificationsModule` would close a cycle the moment `AuthModule` wanted it
 * for OTP delivery. One small module both can import keeps the graph acyclic.
 *
 * `ENV` is global, so no import is needed for it.
 */
@Module({
  providers: [
    {
      // Bound to the abstract class rather than to `Msg91SmsGateway` so callers
      // cannot reach MSG91 directly, and so a test can substitute a gateway
      // without the network.
      provide: SmsGateway,
      inject: ['ENV'],
      useFactory: (env: Env): SmsGateway =>
        new Msg91SmsGateway({
          authKey: env.SMS_PROVIDER_API_KEY,
          senderId: env.SMS_SENDER_ID,
          templateId: env.SMS_TEMPLATE_ID,
          templateVariable: env.SMS_OTP_TEMPLATE_VAR,
          countryCode: env.SMS_COUNTRY_CODE,
        }),
    },
  ],
  exports: [SmsGateway],
})
export class SmsModule {}
