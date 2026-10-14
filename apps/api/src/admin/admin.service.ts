import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  computeUnlockWindow,
  money,
  roundMoney,
  toDecimal,
  toGstRate,
} from '@matrimony/shared';
import type {
  AdminCategoryChangeView,
  AdminChangeCategoryInput,
  AdminCreateInput,
  AdminDataRequestView,
  AdminGrantUnlockInput,
  AdminGrantUnlockView,
  AdminPermissionKey,
  AdminPricingView,
  AdminPublishPricingInput,
  AdminResolveDataRequestInput,
  AdminRoleSlug,
  AdminRoleView,
  AdminUserView,
  DataRequestStatus,
} from '@matrimony/shared';
import { PrismaClient, Prisma } from '../prisma/prisma-client';
import { ClockService } from '../common/clock/clock.service';
import { AuditService } from './audit.service';
import { hashPassword } from '../common/crypto/password';

/** The row shape every administrator read selects, so one mapper covers them all. */
interface AdminRow {
  id: string;
  email: string;
  name: string;
  status: string;
  mfaSecret: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: Array<{ role: { slug: string } }>;
}

const ADMIN_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
  mfaSecret: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { slug: true } } } },
} as const;

/**
 * Never returns a password hash or the MFA secret. The `mfaSecret` column is
 * selected only to derive the boolean below — whether a second factor is
 * enrolled — and the mapper copies fields by name, so a future caller cannot
 * serialise the secret by spreading the row.
 */
function toAdminView(row: AdminRow): AdminUserView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    roles: row.roles.map((assignment) => assignment.role.slug as AdminRoleSlug),
    mfaEnabled: row.mfaSecret !== null,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const DATA_REQUEST_SELECT = {
  id: true,
  userId: true,
  type: true,
  status: true,
  requestedAt: true,
  dueAt: true,
  completedAt: true,
  resolutionNotes: true,
  handledByAdminId: true,
} as const;

interface DataRequestRow {
  id: string;
  userId: string;
  type: string;
  status: string;
  requestedAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  resolutionNotes: string | null;
  handledByAdminId: string | null;
}

function toDataRequestView(row: DataRequestRow): AdminDataRequestView {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as AdminDataRequestView['type'],
    status: row.status as DataRequestStatus,
    requestedAt: row.requestedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    resolutionNotes: row.resolutionNotes,
    handledByAdminId: row.handledByAdminId,
  };
}

interface PricingRow {
  id: string;
  category: string;
  baseAmount: Prisma.Decimal | string | number;
  gstRate: Prisma.Decimal | string | number;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  note: string | null;
  createdByAdminId: string | null;
  createdAt: Date;
}

function toPricingView(row: PricingRow): AdminPricingView {
  return {
    id: row.id,
    category: row.category,
    baseAmount: money(row.baseAmount),
    gstRate: toDecimal(row.gstRate).toFixed(4),
    version: row.version,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : null,
    note: row.note,
    createdByAdminId: row.createdByAdminId,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
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

  /**
   * Section 25 / F2(a): move a user between net-worth categories.
   *
   * Only a real, discoverable band is assignable. `PENDING_REVIEW` is the bucket
   * a boundary value lands in and is not itself a category, so moving a user
   * *out* of it is the whole point of this action while moving one *into* it
   * would be a demotion to "invisible"; both are refused only for the latter.
   * The write and the audit happen together: a category move without a reason is
   * precisely the unchecked access-control change section 3 forbids.
   */
  async changeCategory(
    userId: string,
    input: AdminChangeCategoryInput,
    actingAdminId: string,
  ): Promise<AdminCategoryChangeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, networthCategory: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const category = await this.prisma.netWorthCategoryRef.findUnique({
      where: { key: input.category },
      select: { key: true, isActive: true, isDiscoverable: true },
    });
    if (!category || !category.isActive || !category.isDiscoverable) {
      throw new BadRequestException(`Unknown or non-assignable category: ${input.category}`);
    }
    if (category.key === user.networthCategory) {
      throw new BadRequestException('User is already in that category');
    }

    // Captured before the write: the row object returned by the update is not
    // guaranteed to be distinct from the one just read.
    const previousCategory = user.networthCategory;
    const now = this.clock.now();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        networthCategory: category.key,
        // The boundary note only explains why PENDING_REVIEW was assigned; once
        // an administrator overrides the category it no longer describes the row.
        categoryReviewNote: null,
        categoryChangedAt: now,
        categoryChangedByAdminId: actingAdminId,
      },
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'user:category:change',
      resourceType: 'User',
      resourceId: userId,
      previousValue: { networthCategory: previousCategory },
      newValue: { networthCategory: category.key },
      reason: input.reason,
    });

    return {
      userId,
      previousCategory,
      networthCategory: category.key,
      changedAt: now.toISOString(),
      changedByAdminId: actingAdminId,
    };
  }

  /**
   * Section 29: publish a new pricing version.
   *
   * Append-only, so the currently-active row is closed and a new version opened
   * in one transaction — a publish that closed the old row and then failed
   * before inserting would leave the band with no active price, and every
   * locked-profile render for that band fails closed.
   */
  async publishPricing(
    input: AdminPublishPricingInput,
    actingAdminId: string,
  ): Promise<AdminPricingView> {
    const category = await this.prisma.netWorthCategoryRef.findUnique({
      where: { key: input.category },
      select: { key: true, isActive: true, isDiscoverable: true },
    });
    if (!category || !category.isActive || !category.isDiscoverable) {
      throw new BadRequestException(`Unknown or non-purchasable category: ${input.category}`);
    }

    const baseAmount = roundMoney(input.baseAmount).toFixed(2);
    const gstRate = toGstRate(input.gstPercent).toFixed(4);
    const now = this.clock.now();

    const created = await this.prisma.$transaction(async (tx) => {
      const current = await tx.pricingConfig.findFirst({
        where: { category: input.category, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
        select: { id: true },
      });
      if (current) {
        await tx.pricingConfig.update({ where: { id: current.id }, data: { effectiveTo: now } });
      }

      const highest = await tx.pricingConfig.aggregate({
        where: { category: input.category },
        _max: { version: true },
      });

      return tx.pricingConfig.create({
        data: {
          category: input.category,
          baseAmount,
          gstRate,
          version: (highest._max.version ?? 0) + 1,
          effectiveFrom: now,
          note: input.note ?? null,
          createdByAdminId: actingAdminId,
        },
      });
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'pricing:publish',
      resourceType: 'PricingConfig',
      resourceId: created.id,
      newValue: { category: input.category, baseAmount, gstRate, version: created.version },
      reason: input.note ?? `Published pricing v${created.version} for ${input.category}`,
    });

    return toPricingView(created);
  }

  /**
   * Section 28 / F2(a): grant a contact unlock without a payment.
   *
   * The grant is recorded in `AdminGrantAudit` — the payment-less channel the
   * schema reserves for this — and not as a `ContactUnlock`, because that row
   * requires a verified payment. `UnlockService` reads the grant and honours it
   * for the standard window, so the audit record is also the access decision.
   */
  async grantUnlock(
    input: AdminGrantUnlockInput,
    actingAdminId: string,
  ): Promise<AdminGrantUnlockView> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: input.profileId },
      select: { id: true, userId: true },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const now = this.clock.now();
    const { unlockedAt, unlockExpiresAt } = computeUnlockWindow(now);

    await this.prisma.adminGrantAudit.create({
      data: {
        adminId: actingAdminId,
        targetUserId: profile.userId,
        targetProfileId: profile.id,
        reason: input.reason,
      },
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'unlock:grant',
      resourceType: 'Profile',
      resourceId: profile.id,
      newValue: { targetUserId: profile.userId, expiresAt: unlockExpiresAt.toISOString() },
      reason: input.reason,
    });

    return {
      profileId: profile.id,
      targetUserId: profile.userId,
      grantedAt: unlockedAt.toISOString(),
      expiresAt: unlockExpiresAt.toISOString(),
      reason: input.reason,
    };
  }

  /**
   * The data-subject request queue, most urgent first.
   *
   * Ordered by the statutory deadline rather than arrival so the request closest
   * to breaching its due date is the one at the top.
   */
  async listDataRequests(limit = 20, cursor?: string, status?: DataRequestStatus) {
    const take = Math.min(limit, 100);
    const items = await this.prisma.dataRequest.findMany({
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: status ? { status } : undefined,
      orderBy: [{ dueAt: 'asc' }, { requestedAt: 'asc' }],
      select: DATA_REQUEST_SELECT,
    });
    const hasMore = items.length > take;
    const rows = hasMore ? items.slice(0, take) : items;
    const requests = rows.map(toDataRequestView);
    const nextCursor = hasMore ? requests[requests.length - 1]?.id ?? null : null;
    return { requests, nextCursor, hasMore };
  }

  /**
   * Section 21/32: complete or reject a data request.
   *
   * Resolution is terminal: a request that has already been answered cannot be
   * answered again, so a double-click cannot rewrite a completed decision.
   */
  async resolveDataRequest(
    id: string,
    input: AdminResolveDataRequestInput,
    actingAdminId: string,
  ): Promise<AdminDataRequestView> {
    const request = await this.prisma.dataRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!request) {
      throw new NotFoundException('Data request not found');
    }
    if (request.status === 'COMPLETED' || request.status === 'REJECTED') {
      throw new ConflictException('Data request is already resolved');
    }

    const now = this.clock.now();
    const updated = await this.prisma.dataRequest.update({
      where: { id },
      data: {
        status: input.status,
        completedAt: now,
        resolutionNotes: input.resolutionNotes ?? null,
        handledByAdminId: actingAdminId,
      },
      select: DATA_REQUEST_SELECT,
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'data_request:resolve',
      resourceType: 'DataRequest',
      resourceId: id,
      previousValue: { status: request.status },
      newValue: { status: input.status },
      reason: input.resolutionNotes ?? null,
    });

    return toDataRequestView(updated);
  }

  /**
   * Clears another administrator's MFA so a lost device does not lock them out.
   *
   * This is a recovery path, not an impersonation path: it removes the second
   * factor but grants no access on its own, because the account still needs its
   * password. Self-reset is refused so the code requirement on the disable flow
   * cannot be bypassed by a hijacked session, and the action is audited like
   * every other access-control change.
   */
  async resetMfa(adminId: string, actingAdminId: string): Promise<AdminUserView> {
    if (adminId === actingAdminId) {
      throw new BadRequestException('Use the disable flow, which requires your own current code.');
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, mfaSecret: true },
    });
    if (!admin) {
      throw new NotFoundException('Administrator not found');
    }
    if (!admin.mfaSecret) {
      throw new BadRequestException('MFA is not enabled for this administrator');
    }

    await this.prisma.adminUser.update({ where: { id: adminId }, data: { mfaSecret: null } });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'admin:mfa:reset',
      resourceType: 'AdminUser',
      resourceId: adminId,
      previousValue: { mfa_enabled: true },
      newValue: { mfa_enabled: false },
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
