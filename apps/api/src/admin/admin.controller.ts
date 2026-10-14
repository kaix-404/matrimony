import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  AdminAssignRoleSchema,
  AdminChangeCategorySchema,
  AdminCreateSchema,
  AdminGrantUnlockSchema,
  AdminListAdminsQuerySchema,
  AdminListDataRequestsQuerySchema,
  AdminListUsersQuerySchema,
  AdminPublishPricingSchema,
  AdminResolveDataRequestSchema,
  AdminRoleSlugSchema,
  type AdminAssignRoleInput,
  type AdminCategoryChangeView,
  type AdminChangeCategoryInput,
  type AdminCreateInput,
  type AdminDataRequestView,
  type AdminGrantUnlockInput,
  type AdminGrantUnlockView,
  type AdminListAdminsQuery,
  type AdminListDataRequestsQuery,
  type AdminListUsersQuery,
  type AdminPricingView,
  type AdminPrincipal,
  type AdminPublishPricingInput,
  type AdminResolveDataRequestInput,
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

  /**
   * F2(a): move a user between net-worth categories. Super-Admin-only in
   * practice because only the Super Admin role holds `user:change_category`.
   */
  @Post('users/:id/category')
  @RequirePermission('user:change_category')
  @HttpCode(200)
  async changeCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminChangeCategorySchema)) body: AdminChangeCategoryInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminCategoryChangeView> {
    return this.adminService.changeCategory(id, body, principal.id);
  }

  /** F2(a) / section 29: publish a new pricing version for one band. */
  @Post('pricing')
  @RequirePermission('pricing:write')
  @HttpCode(201)
  async publishPricing(
    @Body(new ZodValidationPipe(AdminPublishPricingSchema)) body: AdminPublishPricingInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminPricingView> {
    return this.adminService.publishPricing(body, principal.id);
  }

  /** F2(a) / section 28: grant a payment-less contact unlock, always audited. */
  @Post('unlocks')
  @RequirePermission('unlock:grant')
  @HttpCode(201)
  async grantUnlock(
    @Body(new ZodValidationPipe(AdminGrantUnlockSchema)) body: AdminGrantUnlockInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminGrantUnlockView> {
    return this.adminService.grantUnlock(body, principal.id);
  }

  /** Section 21/32: the data-subject request queue. */
  @Get('data-requests')
  @RequirePermission('data_request:handle')
  async listDataRequests(
    @Query(new ZodValidationPipe(AdminListDataRequestsQuerySchema)) query: AdminListDataRequestsQuery,
  ) {
    return this.adminService.listDataRequests(query.limit, query.cursor, query.status);
  }

  /** Section 21/32: complete or reject a data request. */
  @Post('data-requests/:id/resolve')
  @RequirePermission('data_request:handle')
  @HttpCode(200)
  async resolveDataRequest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminResolveDataRequestSchema)) body: AdminResolveDataRequestInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminDataRequestView> {
    return this.adminService.resolveDataRequest(id, body, principal.id);
  }
}
