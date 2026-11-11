import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  AdminCreateMasterListValueSchema,
  AdminUpdateMasterListValueSchema,
  MasterListKeySchema,
  type AdminCreateMasterListValueInput,
  type AdminMasterListsResponse,
  type AdminMasterListValueView,
  type AdminUpdateMasterListValueInput,
  type AdminPrincipal,
  type MasterListKey,
} from '@matrimony/shared';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AdminMasterDataService } from './master-data.admin.service';
import { AdminAuthGuard, AdminUser } from './rbac/admin-auth.guard';
import { PermissionsGuard } from './rbac/permissions.guard';
import { RequirePermission } from './rbac/require-permission.decorator';

/**
 * The master lists as an administrator edits them — client decision D3.
 *
 * Separate from `AdminController` because it is a different subject (reference
 * data, not members) and because the public `MasterDataController` already owns
 * the read side the app uses; this is the write side, behind a permission.
 *
 * Read is its own permission so a role can be shown the lists without being able
 * to change what every member sees. There is no delete route: retiring a value
 * is the removal operation, and a row that profiles point at is never destroyed.
 *
 * A list key arriving in the path is validated against `MASTER_LIST_KEYS`, so an
 * unknown list is a 400 naming the parameter rather than a query for a key that
 * cannot exist.
 */
@Controller('admin/master-lists')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminMasterDataController {
  constructor(private readonly masterData: AdminMasterDataService) {}

  @Get()
  @RequirePermission('master_data:read')
  async lists(): Promise<AdminMasterListsResponse> {
    return this.masterData.listLists();
  }

  @Post(':key/values')
  @RequirePermission('master_data:write')
  @HttpCode(201)
  async createValue(
    @Param('key', new ZodValidationPipe(MasterListKeySchema)) key: MasterListKey,
    @Body(new ZodValidationPipe(AdminCreateMasterListValueSchema))
    body: AdminCreateMasterListValueInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminMasterListValueView> {
    return this.masterData.createValue(key, body, principal.id);
  }

  /**
   * Renames, retires or restores one value.
   *
   * POST rather than PATCH because the dashboard's fetch helper speaks GET, POST
   * and DELETE only, and a partial update this small does not justify widening
   * it for every other page.
   */
  @Post('values/:id')
  @RequirePermission('master_data:write')
  @HttpCode(200)
  async updateValue(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminUpdateMasterListValueSchema))
    body: AdminUpdateMasterListValueInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminMasterListValueView> {
    return this.masterData.updateValue(id, body, principal.id);
  }
}
