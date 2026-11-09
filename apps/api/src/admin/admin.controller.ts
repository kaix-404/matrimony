import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminAssignRoleSchema,
  AdminChangeCategorySchema,
  AdminCreateSchema,
  AdminGrantUnlockSchema,
  AdminListAdminsQuerySchema,
  AdminListDataRequestsQuerySchema,
  AdminListPhotosQuerySchema,
  AdminListProfilesQuerySchema,
  AdminListReportsQuerySchema,
  AdminListUsersQuerySchema,
  AdminListVerificationsQuerySchema,
  AdminPublishPricingSchema,
  AdminRejectProfileSchema,
  AdminResolveDataRequestSchema,
  AdminRestoreUserSchema,
  AdminReviewPhotoSchema,
  AdminReviewReportSchema,
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
  type AdminListPhotosQuery,
  type AdminListReportsQuery,
  type AdminListUsersQuery,
  type AdminListVerificationsQuery,
  type AdminPhotoListResponse,
  type AdminPhotoView,
  type AdminPricingView,
  type AdminProfileListResponse,
  type AdminProfileView,
  type AdminListProfilesQuery,
  type AdminRejectProfileInput,
  type AdminPrincipal,
  type AdminPublishPricingInput,
  type AdminReportView,
  type AdminResolveDataRequestInput,
  type AdminRestoreUserInput,
  type AdminRestoreUserView,
  type AdminReviewPhotoInput,
  type AdminReviewReportInput,
  type AdminRoleSlug,
  type AdminRoleView,
  type AdminUserDetailView,
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
    return this.adminService.listUsers(query.limit, query.cursor, query.status, query.q);
  }

  /**
   * The identity-verification list (D9).
   *
   * A read of Aadhaar-derived state, so it is its own permission rather than
   * riding on `identity_verify:review`: a support agent who answers "why did my
   * check fail" should not need the grant that decides the check.
   */
  @Get('verifications')
  @RequirePermission('identity_verify:read')
  async listVerifications(
    @Query(new ZodValidationPipe(AdminListVerificationsQuerySchema))
    query: AdminListVerificationsQuery,
  ) {
    return this.adminService.listVerifications(query.limit, query.cursor, query.status);
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

  /** Recovers an administrator who has lost their authenticator (always audited). */
  @Post('admins/:id/mfa/reset')
  @RequirePermission('admin:manage')
  @HttpCode(200)
  async resetMfa(
    @Param('id') id: string,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminUserView> {
    return this.adminService.resetMfa(id, principal.id);
  }

  /** Section 24: one member account, with the gates that decide what it can do. */
  @Get('users/:id')
  @RequirePermission('user:read')
  async getUser(@Param('id') id: string): Promise<AdminUserDetailView> {
    return this.adminService.getUser(id);
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

  /**
   * F6: bring a closed account back during its retention window.
   *
   * Super-Admin-only like deletion itself: undoing an erasure is the same kind of
   * decision as making one, and it is audited with the reason supplied.
   */
  @Post('users/:id/restore')
  @RequirePermission('user:restore')
  @HttpCode(200)
  async restoreUser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminRestoreUserSchema)) body: AdminRestoreUserInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminRestoreUserView> {
    return this.adminService.restoreUser(id, body, principal.id);
  }

  /**
   * Section 29: current and historical prices, so a change is made against what
   * is actually in force rather than from memory.
   */
  @Get('pricing')
  @RequirePermission('pricing:read')
  async listPricing(): Promise<AdminPricingView[]> {
    return this.adminService.listPricing();
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
    @Query(new ZodValidationPipe(AdminListDataRequestsQuerySchema))
    query: AdminListDataRequestsQuery,
  ) {
    return this.adminService.listDataRequests(query.limit, query.cursor, query.status);
  }

  /** Section 21/32: one data request, including how it was resolved. */
  @Get('data-requests/:id')
  @RequirePermission('data_request:handle')
  async getDataRequest(@Param('id') id: string): Promise<AdminDataRequestView> {
    return this.adminService.getDataRequest(id);
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

  /** Section 9: the photo review queue, oldest upload first. */
  @Get('photos')
  @RequirePermission('photo:review')
  async listPhotos(
    @Query(new ZodValidationPipe(AdminListPhotosQuerySchema)) query: AdminListPhotosQuery,
  ): Promise<AdminPhotoListResponse> {
    return this.adminService.listPhotos(query.limit, query.cursor, query.status);
  }

  /** Section 9: approve or reject one photo. */
  @Post('photos/:id/review')
  @RequirePermission('photo:review')
  @HttpCode(200)
  async reviewPhoto(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminReviewPhotoSchema)) body: AdminReviewPhotoInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminPhotoView> {
    return this.adminService.reviewPhoto(id, body, principal.id);
  }

  /**
   * Section 26: profiles waiting for review, earliest submission first.
   *
   * Behind `profile:read`, not `user:read`: the latter is also held by Finance
   * Admin, who has no reason to see member profiles. The decisions themselves
   * have `profile:approve` and `profile:reject` below.
   */
  @Get('profiles')
  @RequirePermission('profile:read')
  async listProfiles(
    @Query(new ZodValidationPipe(AdminListProfilesQuerySchema)) query: AdminListProfilesQuery,
  ): Promise<AdminProfileListResponse> {
    return this.adminService.listProfiles(query.limit, query.cursor, query.status);
  }

  /** Section 26: make a reviewed profile discoverable. */
  @Post('profiles/:id/approve')
  @RequirePermission('profile:approve')
  @HttpCode(200)
  async approveProfile(
    @Param('id') id: string,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminProfileView> {
    return this.adminService.approveProfile(id, principal.id);
  }

  /** Section 26: refuse a profile, with the reason the member will see. */
  @Post('profiles/:id/reject')
  @RequirePermission('profile:reject')
  @HttpCode(200)
  async rejectProfile(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminRejectProfileSchema)) body: AdminRejectProfileInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminProfileView> {
    return this.adminService.rejectProfile(id, body, principal.id);
  }

  /** Section 30: the moderation queue, optionally filtered by status. */
  @Get('reports')
  @RequirePermission('report:review')
  async listReports(
    @Query(new ZodValidationPipe(AdminListReportsQuerySchema)) query: AdminListReportsQuery,
  ) {
    return this.adminService.listReports(query.limit, query.cursor, query.status);
  }

  /** Section 30: one report in full. */
  @Get('reports/:id')
  @RequirePermission('report:review')
  async getReport(@Param('id') id: string): Promise<AdminReportView> {
    return this.adminService.getReport(id);
  }

  /** Section 30: dismiss or action a report (suspending the target on SUSPEND). */
  @Post('reports/:id/review')
  @RequirePermission('report:review')
  @HttpCode(200)
  async reviewReport(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminReviewReportSchema)) body: AdminReviewReportInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminReportView> {
    return this.adminService.reviewReport(id, body, principal.id);
  }
}
