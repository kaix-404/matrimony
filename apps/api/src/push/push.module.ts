import { Module } from '@nestjs/common';
import { PushGateway, FcmPushGateway } from './push.gateway';
import type { Env } from '../config/env';

/**
 * Push delivery (section 42). The client chose Firebase on 2026-10-01.
 *
 * `ENV` is global, so no import is needed for it. The gateway is bound to the
 * abstract class rather than to `FcmPushGateway` so a test can substitute a
 * gateway without the network, and so no caller can reach FCM directly.
 */
@Module({
  providers: [
    {
      provide: PushGateway,
      inject: ['ENV'],
      useFactory: (env: Env): PushGateway =>
        new FcmPushGateway({ serviceAccountJson: env.FCM_SERVICE_ACCOUNT_JSON }),
    },
  ],
  exports: [PushGateway],
})
export class PushModule {}
