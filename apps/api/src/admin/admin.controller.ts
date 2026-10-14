import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminListUsersQuerySchema, type AdminListUsersQuery } from '@matrimony/shared';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from './rbac/admin-auth.guard';
import { PermissionsGuard } from './rbac/permissions.guard';
import { RequirePermission } from './rbac/require-permission.decorator';

/**
 * Admin endpoints.
 *
 * Guard order matters and is not interchangeable: `AdminAuthGuard` establishes
 * `request.admin`, and `PermissionsGuard` reads it. Reversing them would make the
 * permission guard throw `UnauthorizedException` for a token it never got to see.
 */
@Controller('admin')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @RequirePermission('user:read')
  async listUsers(
    @Query(new ZodValidationPipe(AdminListUsersQuerySchema)) query: AdminListUsersQuery,
  ) {
    return this.adminService.listUsers(query.limit, query.cursor);
  }
}
