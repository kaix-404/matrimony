import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ListNotificationsQuerySchema, type ListNotificationsQuery } from '@matrimony/shared';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @AuthUser('id') userId: string,
    @Query(new ZodValidationPipe(ListNotificationsQuerySchema)) query: ListNotificationsQuery,
  ) {
    return this.notificationsService.listForUser(userId, query.limit ?? 20, query.cursor);
  }
}
