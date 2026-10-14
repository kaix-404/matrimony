import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  AdminAssignRoleSchema,
  AdminCreateSchema,
  AdminListAdminsQuerySchema,
  AdminListUsersQuerySchema,
  AdminRoleSlugSchema,
  type AdminAssignRoleInput,
  type AdminCreateInput,
  type AdminListAdminsQuery,
  type AdminListUsersQuery,
  type AdminPrincipal,
  type AdminRoleSlug,
  type AdminRoleView,
  type AdminUserView,
} from '@matrimony/shared';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AdminService } from './admin.service';
import { AdminAuthGuard, AdminUser } from './rbac/admin-auth.guard';
import { PermissionsGuard } from './rbac/permissions.guard';
import { RequirePermission } from './rbac/require-permission.decorator';

/**
 * Admin endpoints.
 *
 * Guard order matters and is not interchangeable: `AdminAuthGuard` establishes
 * `request.admin`, and `PermissionsGuard` reads it. Reversing them would make the
 * permission guard throw `UnauthorizedException` for a token it never got to see.
 *
 * Every handler states its permission explicitly. There is no class-level grant:
 * a controller-wide `@RequirePermission` would mean a new handler silently
 * inherits whatever the class declared, which is how a read permission quietly
 * becomes a write permission.
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

  @Get('roles')
  @RequirePermission('admin:manage')
  async listRoles(): Promise<AdminRoleView[]> {
    return this.adminService.listRoles();
  }

  @Get('admins')
  @RequirePermission('admin:manage')
  async listAdmins(
    @Query(new ZodValidationPipe(AdminListAdminsQuerySchema)) query: AdminListAdminsQuery,
  ) {
    return this.adminService.listAdmins(query.limit, query.cursor);
  }

  @Post('admins')
  @RequirePermission('admin:manage')
  @HttpCode(201)
  async createAdmin(
    @Body(new ZodValidationPipe(AdminCreateSchema)) body: AdminCreateInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminUserView> {
    return this.adminService.createAdmin(body, principal.id);
  }

  @Post('admins/:id/roles')
  @RequirePermission('admin:manage')
  @HttpCode(200)
  async assignRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminAssignRoleSchema)) body: AdminAssignRoleInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminUserView> {
    return this.adminService.assignRole(id, body.role, principal.id);
  }

  @Delete('admins/:id/roles/:role')
  @RequirePermission('admin:manage')
  @HttpCode(200)
  async revokeRole(
    @Param('id') id: string,
    @Param('role', new ZodValidationPipe(AdminRoleSlugSchema)) role: AdminRoleSlug,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminUserView> {
    return this.adminService.revokeRole(id, role, principal.id);
  }
}
