import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminPermissionKey } from '@matrimony/shared';
import { PrismaClient } from '../../prisma/prisma-client';
import { PERMISSIONS_METADATA_KEY } from './require-permission.decorator';
import { resolvePermissionsForRoles } from './resolve-permissions';
import type { AdminRequest } from './admin-request';

/**
 * Enforces `@RequirePermission(...)` against the administrator's role grants.
 *
 * Section 33 is explicit that access is decided by permissions, not by hidden UI
 * buttons, so this guard reads the `AdminRolePermission` join on every request
 * rather than trusting a role list baked into the token. A permission revoked in
 * the database therefore stops working on the next request, which is the whole
 * reason to resolve grants dynamically.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler metadata overrides class metadata, so a controller may require one
    // permission broadly while a single handler tightens or relaxes it.
    const required =
      this.reflector.getAllAndOverride<AdminPermissionKey[]>(PERMISSIONS_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const admin = request.admin;
    if (!admin) {
      throw new UnauthorizedException('Not authenticated as an administrator');
    }

    const held = await resolvePermissionsForRoles(this.prisma, admin.roles);
    const missing = required.filter((permission) => !held.has(permission));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    }

    return true;
  }
}
