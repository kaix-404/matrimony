import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DeviceTokensService } from './device-tokens.service';
import { DeviceTokensController } from './device-tokens.controller';
import { PushDispatchService } from './push-dispatch.service';
import { PushDispatchSweeper } from './push-dispatch.sweeper';

/**
 * `PushModule` supplies the FCM gateway. It is a separate module because the
 * gateway touches the vendor and must be substitutable in tests; importing it
 * here keeps the vendor out of this module's own dependencies.
 */
@Module({
  imports: [PrismaModule, AuthModule, PushModule],
  providers: [NotificationsService, DeviceTokensService, PushDispatchService, PushDispatchSweeper],
  controllers: [NotificationsController, DeviceTokensController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
