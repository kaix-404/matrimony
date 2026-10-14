import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminCreateInput,
  AdminPermissionKey,
  AdminRoleSlug,
  AdminRoleView,
  AdminUserView,
} from '@matrimony/shared';
import { PrismaClient } from '../prisma/prisma-client';
import { AuditService } from './audit.service';
import { hashPassword } from '../common/crypto/password';

/** The row shape every administrator read selects, so one mapper covers them all. */
interface AdminRow {
  id: string;
  email: string;
  name: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: Array<{ role: { slug: string } }>;
}

const ADMIN_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { slug: true } } } },
} as const;

/**
 * Never returns a password hash. The select above does not fetch one, and the
 * mapper below only copies the fields the contract names, so a future caller
 * cannot accidentally serialise a credential by spreading the row.
 */
function toAdminView(row: AdminRow): AdminUserView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    roles: row.roles.map((assignment) => assignment.role.slug as AdminRoleSlug),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async listUsers(limit = 20, cursor?: string) {
    const take = Math.min(limit, 100);
    const items = await this.prisma.user.findMany({
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, mobile: true, status: true, createdAt: true },
    });
    const hasMore = items.length > take;
    const users = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? users[users.length - 1]?.id ?? null : null;
    return { users, nextCursor, hasMore };
  }

  /**
   * Lists the role catalogue with the permissions each role currently grants.
   *
   * Read from the join rather than from `ADMIN_PERMISSIONS`, because the point
   * of this screen is to show what is *actually* granted right now — which can
   * differ from the code catalogue between a deploy and a seed.
   */
  async listRoles(): Promise<AdminRoleView[]> {
    const roles = await this.prisma.adminRole.findMany({
      orderBy: { slug: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });

    return roles.map((role) => ({
      id: role.id,
      slug: role.slug as AdminRoleSlug,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((grant) => ({
        key: grant.permission.key as AdminPermissionKey,
        resource: grant.permission.resource,
        action: grant.permission.action,
        sensitive: grant.permission.isSensitive,
      })),
    }));
  }

  async listAdmins(limit = 20, cursor?: string) {
    const take = Math.min(limit, 100);
    const items = await this.prisma.adminUser.findMany({
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      select: ADMIN_SELECT,
    });
    const hasMore = items.length > take;
    const rows = hasMore ? items.slice(0, take) : items;
    const admins = rows.map(toAdminView);
    const nextCursor = hasMore ? admins[admins.length - 1]?.id ?? null : null;
    return { admins, nextCursor, hasMore };
  }

  /**
   * Creates an administrator and grants the requested roles.
   *
   * The password is hashed here, not stored as given, using the same scrypt
   * format login verifies. The audit row is written after the account exists so
   * a failed insert does not leave a log entry claiming an account that was
   * never made.
   */
  async createAdmin(input: AdminCreateInput, actingAdminId: string): Promise<AdminUserView> {
    const roleRows = await this.prisma.adminRole.findMany({
      where: { slug: { in: input.roles } },
      select: { id: true, slug: true },
    });

    const found = new Set(roleRows.map((role) => role.slug));
    const missing = input.roles.filter((slug) => !found.has(slug));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown role(s): ${missing.join(', ')}`);
    }

    let created: AdminRow;
    try {
      created = await this.prisma.adminUser.create({
        data: {
          id: randomUUID(),
          email: input.email,
          name: input.name,
          passwordHash: hashPassword(input.password),
          roles: {
            create: roleRows.map((role) => ({
              role: { connect: { id: role.id } },
              grantedByAdminId: actingAdminId,
            })),
          },
        },
        select: ADMIN_SELECT,
      });
    } catch (error) {
      // The unique email is the only constraint a caller can trigger here; a
      // 500 would tell them nothing and a raw Prisma error would leak schema.
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('An administrator with that email already exists');
      }
      throw error;
    }

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'admin:create',
      resourceType: 'AdminUser',
      resourceId: created.id,
      newValue: { email: created.email, roles: created.roles.map((a) => a.role.slug) },
    });

    return toAdminView(created);
  }

  /** Grants a role to an administrator. Idempotent: re-granting is a no-op. */
  async assignRole(
    adminId: string,
    roleSlug: AdminRoleSlug,
    actingAdminId: string,
  ): Promise<AdminUserView> {
    this.assertNotSelf(adminId, actingAdminId);

    const role = await this.prisma.adminRole.findUnique({ where: { slug: roleSlug }, select: { id: true } });
    if (!role) {
      throw new BadRequestException(`Unknown role: ${roleSlug}`);
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId }, select: { id: true } });
    if (!admin) {
      throw new NotFoundException('Administrator not found');
    }

    const existing = await this.prisma.adminRoleAssignment.findUnique({
      where: { adminId_roleId: { adminId, roleId: role.id } },
      select: { adminId: true },
    });
    if (existing) {
      return this.getAdminView(adminId);
    }

    await this.prisma.adminRoleAssignment.create({
      data: { adminId, roleId: role.id, grantedByAdminId: actingAdminId },
    });
    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'admin:role:grant',
      resourceType: 'AdminUser',
      resourceId: adminId,
      newValue: { role: roleSlug },
    });

    return this.getAdminView(adminId);
  }

  /**
   * Revokes a role from an administrator.
   *
   * Two refusals protect the system from locking itself out. Self-changes are
   * barred, so an administrator cannot strip their own access by mistake or on a
   * whim; and the last Super Admin cannot be removed, because a system with no
   * Super Admin can still serve members but can never again grant a permission.
   */
  async revokeRole(
    adminId: string,
    roleSlug: AdminRoleSlug,
    actingAdminId: string,
  ): Promise<AdminUserView> {
    this.assertNotSelf(adminId, actingAdminId);

    const role = await this.prisma.adminRole.findUnique({ where: { slug: roleSlug }, select: { id: true } });
    if (!role) {
      throw new BadRequestException(`Unknown role: ${roleSlug}`);
    }

    if (roleSlug === 'SUPER_ADMIN') {
      const holders = await this.prisma.adminRoleAssignment.count({ where: { roleId: role.id } });
      if (holders <= 1) {
        throw new BadRequestException('Cannot revoke the last Super Admin.');
      }
    }

    const removed = await this.prisma.adminRoleAssignment.deleteMany({
      where: { adminId, roleId: role.id },
    });
    if (removed.count === 0) {
      throw new NotFoundException('Administrator does not hold that role');
    }

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'admin:role:revoke',
      resourceType: 'AdminUser',
      resourceId: adminId,
      previousValue: { role: roleSlug },
    });

    return this.getAdminView(adminId);
  }

  private async getAdminView(adminId: string): Promise<AdminUserView> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId }, select: ADMIN_SELECT });
    if (!admin) {
      throw new NotFoundException('Administrator not found');
    }
    return toAdminView(admin);
  }

  private assertNotSelf(adminId: string, actingAdminId: string): void {
    if (adminId === actingAdminId) {
      throw new BadRequestException('You cannot change your own roles.');
    }
  }
}
