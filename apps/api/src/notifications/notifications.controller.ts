import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  ListNotificationsQuerySchema,
  type ListNotificationsQuery,
  type AccessTokenClaims,
} from '@matrimony/shared';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @AuthUser() claims: AccessTokenClaims,
    @Query(new ZodValidationPipe(ListNotificationsQuerySchema)) query: ListNotificationsQuery,
  ) {
    return this.notificationsService.listForUser(claims.sub, query.limit ?? 20, query.cursor);
  }
}
