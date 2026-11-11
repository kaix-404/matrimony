import { Module } from '@nestjs/common';
import { EmailGateway, Msg91EmailGateway } from './email.gateway';
import type { Env } from '../config/env';

/**
 * Transactional email (client decision GAP-12: MSG91).
 *
 * Its own module for the same reason `SmsModule` is: the gateway is a seam that
 * the auth module injects and tests substitute whole, so nothing that imports it
 * needs to know that MSG91 is behind it or how a send is shaped.
 *
 * `ENV` is global, so no import is needed for it.
 */
@Module({
  providers: [
    {
      provide: EmailGateway,
      inject: ['ENV'],
      useFactory: (env: Env): EmailGateway =>
        new Msg91EmailGateway({
          authKey: env.EMAIL_PROVIDER_API_KEY,
          fromEmail: env.EMAIL_FROM_ADDRESS,
          fromName: env.EMAIL_FROM_NAME,
          templateId: env.EMAIL_TEMPLATE_ID,
          templateVariable: env.EMAIL_OTP_TEMPLATE_VAR,
        }),
    },
  ],
  exports: [EmailGateway],
})
export class EmailModule {}
