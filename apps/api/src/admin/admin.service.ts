import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NOTIFICATION_EVENTS,
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
  AdminPhotoListResponse,
  AdminPhotoView,
  AdminPricingView,
  AdminProfileListResponse,
  AdminProfileView,
  AdminRejectProfileInput,
  AdminPublishPricingInput,
  AdminReportView,
  AdminResolveDataRequestInput,
  AdminRestoreUserInput,
  AdminRestoreUserView,
  AdminReviewPhotoInput,
  AdminReviewReportInput,
  AdminRoleSlug,
  AdminRoleView,
  AdminUserDetailView,
  AdminUserStatus,
  AdminUserView,
  AdminVerificationStatus,
  AdminVerificationView,
  IdentityVerificationProvider,
  IdentityVerificationVendor,
  DataRequestStatus,
  PhotoStatus,
  ReportActionType,
  ReportStatus,
} from '@matrimony/shared';
import {
  IdentityVerificationStatus as PrismaVerificationStatus,
  Prisma,
  PrismaClient,
  UserStatus,
} from '../prisma/prisma-client';
import { ClockService } from '../common/clock/clock.service';
import { StorageService } from '../storage/s3.service';
import { NotificationsService } from '../notifications/notifications.service';
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
} as const satisfies Prisma.AdminUserSelect;

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

/**
 * The identity-verification row shape the list reads.
 *
 * `providerReference`, `nameOnId` and `screeningResult` are absent on purpose:
 * the support question is "verified, or failed and why", and those three are
 * supplier material that the answer does not need.
 */
const VERIFICATION_SELECT = {
  id: true,
  userId: true,
  provider: true,
  vendor: true,
  status: true,
  aadhaarLast4: true,
  yearOfBirth: true,
  failureCode: true,
  failureReason: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { mobile: true, status: true } },
  consentRecord: { select: { grantedAt: true } },
} as const satisfies Prisma.IdentityVerificationSelect;

interface VerificationRow {
  id: string;
  userId: string;
  provider: string;
  vendor: string | null;
  status: string;
  aadhaarLast4: string | null;
  yearOfBirth: number | null;
  failureCode: string | null;
  failureReason: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: { mobile: string; status: string };
  consentRecord: { grantedAt: Date } | null;
}

/** Copies fields by name, so a selected column cannot leak by spreading the row. */
function toVerificationView(row: VerificationRow): AdminVerificationView {
  return {
    id: row.id,
    userId: row.userId,
    memberMobile: row.user.mobile,
    memberStatus: row.user.status,
    provider: row.provider as IdentityVerificationProvider,
    vendor: row.vendor as IdentityVerificationVendor | null,
    status: row.status as AdminVerificationStatus,
    aadhaarLast4: row.aadhaarLast4,
    yearOfBirth: row.yearOfBirth,
    failureCode: row.failureCode,
    failureReason: row.failureReason,
    consentedAt: row.consentRecord ? row.consentRecord.grantedAt.toISOString() : null,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const PROFILE_REVIEW_SELECT = {
  id: true,
  userId: true,
  firstName: true,
  lastName: true,
  city: true,
  dateOfBirth: true,
  status: true,
  updatedAt: true,
  approvedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  photos: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    take: 1,
    select: { objectKey: true },
  },
} satisfies Prisma.ProfileSelect;

interface ProfileReviewRow {
  id: string;
  userId: string;
  firstName: string;
  lastName: string | null;
  city: string | null;
  dateOfBirth: Date;
  status: string;
  updatedAt: Date;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  photos: Array<{ objectKey: string }>;
}

/** Whole years between a date of birth and now. */
function ageFrom(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * A profile as the review queue shows it.
 *
 * `submitted_at` is the row's `updatedAt`, which is the moment it was submitted:
 * the submit call is what put it in PENDING_REVIEW, and an edit after that would
 * have returned it to DRAFT. There is no separate column, and adding one to say
 * the same thing would be a migration for no extra information.
 */
function toProfileReviewView(
  row: ProfileReviewRow,
  photoUrl: string | null,
  now: Date,
): AdminProfileView {
  const reviewedAt = row.status === 'APPROVED' ? row.approvedAt : row.rejectedAt;
  return {
    id: row.id,
    user_id: row.userId,
    name: [row.firstName, row.lastName].filter(Boolean).join(' '),
    city: row.city,
    age: ageFrom(row.dateOfBirth, now),
    status: row.status as AdminProfileView['status'],
    photo_url: photoUrl,
    submitted_at: row.updatedAt.toISOString(),
    reviewed_at: reviewedAt ? reviewedAt.toISOString() : null,
    rejection_reason: row.rejectionReason,
  };
}

const PHOTO_SELECT = {
  id: true,
  profileId: true,
  status: true,
  photoType: true,
  objectKey: true,
  createdAt: true,
  reviewedAt: true,
  rejectionReason: true,
  reviewedByAdminId: true,
  profile: { select: { firstName: true } },
} as const satisfies Prisma.ProfilePhotoSelect;

interface PhotoRow {
  id: string;
  profileId: string;
  status: string;
  photoType: string;
  objectKey: string;
  createdAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  reviewedByAdminId: string | null;
  profile: { firstName: string | null } | null;
}

/**
 * Section 9: a photo as the reviewer sees it.
 *
 * The URL is signed here, at the moment of the read, rather than stored or
 * cached: it expires in minutes, so a queue page left open overnight has to be
 * refreshed to still show anything, which is the property section 41 asks for.
 */
function toPhotoView(row: PhotoRow, url: string): AdminPhotoView {
  return {
    id: row.id,
    profile_id: row.profileId,
    profile_name: row.profile ? row.profile.firstName : null,
    status: row.status as AdminPhotoView['status'],
    photo_type: row.photoType as AdminPhotoView['photo_type'],
    url,
    uploaded_at: row.createdAt.toISOString(),
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    rejection_reason: row.rejectionReason,
    reviewed_by_admin_id: row.reviewedByAdminId,
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
} as const satisfies Prisma.DataRequestSelect;

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

const REPORT_SELECT = {
  id: true,
  status: true,
  description: true,
  reviewNotes: true,
  actionTaken: true,
  resolvedAt: true,
  resolvedByAdminId: true,
  createdAt: true,
  updatedAt: true,
  reporterId: true,
  reportedProfileId: true,
  reportedUserId: true,
  reason: { select: { code: true } },
} as const satisfies Prisma.ReportSelect;

interface ReportRow {
  id: string;
  status: string;
  description: string | null;
  reviewNotes: string | null;
  actionTaken: string | null;
  resolvedAt: Date | null;
  resolvedByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
  reporterId: string;
  reportedProfileId: string | null;
  reportedUserId: string | null;
  reason: { code: string };
}

function toReportView(row: ReportRow): AdminReportView {
  return {
    id: row.id,
    status: row.status as ReportStatus,
    reason_code: row.reason.code,
    reporter_user_id: row.reporterId,
    reported_profile_id: row.reportedProfileId,
    reported_user_id: row.reportedUserId,
    description: row.description,
    review_notes: row.reviewNotes,
    action_taken: row.actionTaken ? (row.actionTaken as ReportActionType) : null,
    resolved_at: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolved_by_admin_id: row.resolvedByAdminId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
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
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * One member account, for the support conversation about it.
   *
   * The three gates are the point: a member who says "I still cannot browse" is
   * either unverified, unpaid, or suspended, and the answer is a timestamp away.
   * The profile contributes its id and moderation state so an administrator can
   * act on it (grant an unlock) without this view exposing any of its content.
   */
  async getUser(id: string): Promise<AdminUserDetailView> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        mobile: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        isPhoneVerified: true,
        identityVerifiedAt: true,
        setupFeePaidAt: true,
        networthCategory: true,
        categoryReviewNote: true,
        categoryChangedAt: true,
        deletedAt: true,
        isAnonymised: true,
        profile: { select: { id: true, status: true, visibility: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('User not found');
    }

    return {
      id: row.id,
      email: row.email,
      mobile: row.mobile,
      status: row.status as AdminUserStatus,
      createdAt: row.createdAt.toISOString(),
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      isPhoneVerified: row.isPhoneVerified,
      identityVerifiedAt: row.identityVerifiedAt ? row.identityVerifiedAt.toISOString() : null,
      setupFeePaidAt: row.setupFeePaidAt ? row.setupFeePaidAt.toISOString() : null,
      networthCategory: row.networthCategory,
      categoryReviewNote: row.categoryReviewNote,
      categoryChangedAt: row.categoryChangedAt ? row.categoryChangedAt.toISOString() : null,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      isAnonymised: row.isAnonymised,
      profile: row.profile
        ? { id: row.profile.id, status: row.profile.status, visibility: row.profile.visibility }
        : null,
    };
  }

  /**
   * The member account list, optionally narrowed by lifecycle state or a search
   * term.
   *
   * The term is matched against the mobile number and the email address, the two
   * handles support is given on a call. It is not matched against a name: names
   * live on the profile, which is a separate permission-checked read, and this
   * list must not become a way to search the hidden half of a member's data. The
   * email match is case-insensitive because email addresses are, and the mobile
   * match is not because digits are not.
   */
  async listUsers(limit = 20, cursor?: string, status?: AdminUserStatus, q?: string) {
    const take = Math.min(limit, 100);
    const items = await this.prisma.user.findMany({
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: {
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { mobile: { contains: q } },
                { email: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, mobile: true, status: true, createdAt: true },
    });
    const hasMore = items.length > take;
    const users = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? (users[users.length - 1]?.id ?? null) : null;
    return { users, nextCursor, hasMore };
  }

  /**
   * The identity-verification list (D9, section 24).
   *
   * Newest first like every other queue, optionally narrowed to one stored state.
   * The member's mobile is joined in because a check with no way to reach the
   * person behind it is not actionable, and the account's lifecycle status comes
   * with it so a passed check on a suspended account is not read as "fine".
   *
   * The supplier reference and the name printed on the ID are not selected: this
   * screen answers "verified, or failed and why", and neither field is needed for
   * that. Selecting less is the safer default when the row is Aadhaar-derived.
   */
  async listVerifications(limit = 20, cursor?: string, status?: AdminVerificationStatus) {
    const take = Math.min(limit, 100);
    const items = await this.prisma.identityVerification.findMany({
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: status ? { status: status as PrismaVerificationStatus } : undefined,
      orderBy: { createdAt: 'desc' },
      select: VERIFICATION_SELECT,
    });
    const hasMore = items.length > take;
    const rows = hasMore ? items.slice(0, take) : items;
    const verifications = rows.map(toVerificationView);
    const nextCursor = hasMore ? (verifications[verifications.length - 1]?.id ?? null) : null;
    return { verifications, nextCursor, hasMore };
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
    const nextCursor = hasMore ? (admins[admins.length - 1]?.id ?? null) : null;
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

    const role = await this.prisma.adminRole.findUnique({
      where: { slug: roleSlug },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException(`Unknown role: ${roleSlug}`);
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true },
    });
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

    const role = await this.prisma.adminRole.findUnique({
      where: { slug: roleSlug },
      select: { id: true },
    });
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
   * Only a real, discoverable band is assignable. `PENDING_REVIEW` is the
   * fail-closed bucket for a user no band placed (GAP-2 closed: a boundary value
   * goes up into the higher band, so it is *not* what a boundary lands in), and it
   * is not itself a category, so moving a user *out* of it is the whole point of
   * this action while moving one *into* it would be a demotion to "invisible";
   * both are refused only for the latter.
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
   * Section 29: every pricing version, newest first within each band.
   *
   * Publishing is append-only, so a price change is only reviewable as history:
   * the row that is in force is the one with no `effectiveTo`, and the ones
   * before it are what a member was charged last week. Both come from here, so
   * an administrator can see the current price before replacing it.
   */
  async listPricing(): Promise<AdminPricingView[]> {
    const rows = await this.prisma.pricingConfig.findMany({
      orderBy: [{ category: 'asc' }, { effectiveFrom: 'desc' }],
    });
    return rows.map(toPricingView);
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
    const nextCursor = hasMore ? (requests[requests.length - 1]?.id ?? null) : null;
    return { requests, nextCursor, hasMore };
  }

  /**
   * Section 21/32: complete or reject a data request.
   *
   * Resolution is terminal: a request that has already been answered cannot be
   * answered again, so a double-click cannot rewrite a completed decision.
   */
  /**
   * One data-subject request in full.
   *
   * The queue answers "what needs handling"; this answers "what did we tell this
   * member", which is what an administrator opens before deciding and what was
   * promised to the data subject afterwards. The resolution notes are the point:
   * a refused erasure request is a decision the member is entitled to read.
   */
  async getDataRequest(id: string): Promise<AdminDataRequestView> {
    const row = await this.prisma.dataRequest.findUnique({
      where: { id },
      select: DATA_REQUEST_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Data request not found');
    }
    return toDataRequestView(row);
  }

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
   * Section 30: the moderation queue.
   *
   * Ordered newest-first, matching the report intake: a fresh complaint is the
   * one most likely to need a response, and an old one that has gone unhandled
   * this long is not made more urgent by being shown first.
   */
  /**
   * Section 9: the photo review queue.
   *
   * Oldest first, unlike every other queue here. A report and a data request are
   * answered by whoever is working; an unapproved photo is a member who cannot be
   * seen in anybody's feed, so the one who has waited longest goes next. Sorting
   * newest-first would let a busy day starve the people at the back forever.
   *
   * The cursor is the photo id, and the order is stable because uploads have
   * distinct creation times and the id breaks any tie.
   */
  async listPhotos(
    limit = 20,
    cursor?: string,
    status: PhotoStatus = 'PENDING_REVIEW',
  ): Promise<AdminPhotoListResponse> {
    const take = Math.min(limit, 100);
    const items = await this.prisma.profilePhoto.findMany({
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: { status: status as never },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: PHOTO_SELECT,
    });

    const hasMore = items.length > take;
    const rows = hasMore ? items.slice(0, take) : items;
    const photos = await Promise.all(
      rows.map(async (row) => toPhotoView(row, await this.storage.presignDownload(row.objectKey))),
    );
    return {
      photos,
      nextCursor: hasMore ? (photos[photos.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Section 9: approve or reject one photo.
   *
   * Repeating the decision already recorded is a no-op rather than an error: the
   * queue page a moderator is looking at can be minutes stale, and two
   * moderators pressing the same button is not a failure to explain — it is the
   * outcome both asked for. Anything else is a real change and is audited with
   * the status it replaced.
   *
   * Rejection requires a reason (enforced by the contract, not here, so a client
   * cannot send an empty one) because it is the only thing the member will have
   * to explain why their photo disappeared.
   */
  async reviewPhoto(
    id: string,
    input: AdminReviewPhotoInput,
    actingAdminId: string,
  ): Promise<AdminPhotoView> {
    const row = await this.prisma.profilePhoto.findUnique({ where: { id }, select: PHOTO_SELECT });
    if (!row) {
      throw new NotFoundException('Photo not found');
    }

    const approving = input.decision === 'APPROVE';
    const nextStatus = approving ? 'APPROVED' : 'REJECTED';

    if (row.status === nextStatus) {
      return toPhotoView(row, await this.storage.presignDownload(row.objectKey));
    }

    // Read before the write: the audit line is about the status this decision
    // replaced, not about what the row says once it has been updated.
    const previousStatus = row.status;

    const updated = await this.prisma.profilePhoto.update({
      where: { id },
      data: {
        status: nextStatus as never,
        reviewedAt: this.clock.now(),
        reviewedByAdminId: actingAdminId,
        // An approval clears the old reason: a photo that is now visible must not
        // carry the explanation with which it was once refused.
        rejectionReason: approving ? null : (input.rejection_reason ?? null),
      },
      select: PHOTO_SELECT,
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'photo:review',
      resourceType: 'ProfilePhoto',
      resourceId: id,
      previousValue: { status: previousStatus },
      newValue: { status: nextStatus, rejectionReason: updated.rejectionReason },
      reason: input.rejection_reason ?? null,
    });

    return toPhotoView(updated, await this.storage.presignDownload(updated.objectKey));
  }

  // -- profile review (section 26) -----------------------------------------

  /**
   * The section 26 queue.
   *
   * Pending profiles are served oldest first, like the photo queue and for the
   * same reason: a first-in-first-out queue is the only order in which waiting
   * time cannot quietly grow for the person who submitted first. Every other
   * status is history, and history reads newest first.
   */
  async listProfiles(
    limit = 20,
    cursor?: string,
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' = 'PENDING_REVIEW',
  ): Promise<AdminProfileListResponse> {
    const take = Math.min(limit, 100);
    const oldestFirst = status === 'PENDING_REVIEW';
    const items = await this.prisma.profile.findMany({
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: { status: status as never, deletedAt: null },
      orderBy: oldestFirst
        ? [{ updatedAt: 'asc' as const }, { id: 'asc' as const }]
        : [{ updatedAt: 'desc' as const }, { id: 'desc' as const }],
      select: PROFILE_REVIEW_SELECT,
    });

    const hasMore = items.length > take;
    const rows = hasMore ? items.slice(0, take) : items;
    const now = this.clock.now();
    const profiles = await Promise.all(
      rows.map(async (row) =>
        toProfileReviewView(row, await this.photoUrl(row.photos[0]?.objectKey), now),
      ),
    );
    return {
      profiles,
      nextCursor: hasMore ? (profiles[profiles.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Approves a profile, making it discoverable for the first time.
   *
   * Re-approving an approved profile is a no-op rather than an error: a reviewer
   * working two browser tabs should not see a failure for a decision that is
   * already in force. A suspended profile is refused — lifting a suspension is a
   * different action with different consequences, not a review outcome.
   */
  async approveProfile(id: string, actingAdminId: string): Promise<AdminProfileView> {
    const row = await this.requireReviewable(id);
    if (row.status === 'APPROVED') {
      return toProfileReviewView(
        row,
        await this.photoUrl(row.photos[0]?.objectKey),
        this.clock.now(),
      );
    }

    // Read before the write: the audit line records the status this decision
    // replaced, not what the row says once it has been updated.
    const previousStatus = row.status;

    const updated = await this.prisma.profile.update({
      where: { id },
      data: {
        status: 'APPROVED' as never,
        approvedAt: this.clock.now(),
        approvedByAdminId: actingAdminId,
        rejectedAt: null,
        rejectionReason: null,
      },
      select: PROFILE_REVIEW_SELECT,
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'profile:approve',
      resourceType: 'Profile',
      resourceId: id,
      previousValue: { status: previousStatus },
      newValue: { status: 'APPROVED' },
      reason: null,
    });

    await this.notifyProfile(id, 'PROFILE_APPROVED', null);

    return toProfileReviewView(
      updated,
      await this.photoUrl(updated.photos[0]?.objectKey),
      this.clock.now(),
    );
  }

  /**
   * Refuses a profile and stores why.
   *
   * The reason reaches the member's own profile view, so a rejection is
   * actionable instead of leaving them guessing. Rejecting an already-rejected
   * profile replaces the reason (a moderator correcting themselves) rather than
   * failing.
   */
  async rejectProfile(
    id: string,
    input: AdminRejectProfileInput,
    actingAdminId: string,
  ): Promise<AdminProfileView> {
    const row = await this.requireReviewable(id);
    const previousStatus = row.status;

    const updated = await this.prisma.profile.update({
      where: { id },
      data: {
        status: 'REJECTED' as never,
        rejectedAt: this.clock.now(),
        rejectionReason: input.rejection_reason,
        approvedAt: null,
        approvedByAdminId: null,
      },
      select: PROFILE_REVIEW_SELECT,
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'profile:reject',
      resourceType: 'Profile',
      resourceId: id,
      previousValue: { status: previousStatus },
      newValue: { status: 'REJECTED', rejectionReason: input.rejection_reason },
      reason: input.rejection_reason,
    });

    await this.notifyProfile(id, 'PROFILE_REJECTED', input.rejection_reason);

    return toProfileReviewView(
      updated,
      await this.photoUrl(updated.photos[0]?.objectKey),
      this.clock.now(),
    );
  }

  private async requireReviewable(id: string): Promise<ProfileReviewRow> {
    const row = await this.prisma.profile.findUnique({
      where: { id },
      select: PROFILE_REVIEW_SELECT,
    });
    if (!row || row.status === 'DELETED') {
      throw new NotFoundException('Profile not found');
    }
    if (row.status === 'SUSPENDED') {
      throw new ConflictException(
        'A suspended profile cannot be reviewed; lift the suspension first',
      );
    }
    return row;
  }

  /** Presigned photo URL, or nothing: a missing photo must not fail the queue. */
  private async photoUrl(objectKey: string | undefined): Promise<string | null> {
    if (!objectKey) return null;
    return this.storage.presignDownload(objectKey).catch(() => null);
  }

  /** Tells the member the outcome of their review. */
  private async notifyProfile(
    profileId: string,
    type: 'PROFILE_APPROVED' | 'PROFILE_REJECTED',
    reason: string | null,
  ): Promise<void> {
    try {
      const profile = await this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { userId: true },
      });
      if (!profile) return;
      await this.notifications.create({
        userId: profile.userId,
        event: NOTIFICATION_EVENTS[type],
        channel: 'PUSH',
        title: type === 'PROFILE_APPROVED' ? 'Your profile is live' : 'Your profile needs changes',
        body:
          type === 'PROFILE_APPROVED'
            ? 'Members can now find you in search.'
            : 'Open the app to see what to change, then submit it again.',
        payload: reason ? { rejection_reason: reason } : undefined,
      });
    } catch (error) {
      // Same rule as every other courtesy notification: the decision is already
      // recorded and must not be rolled back because a notice could not be sent.
      this.logger.error(`Failed to notify profile ${profileId}: ${String(error)}`);
    }
  }

  /**
   * F6: undo a deletion inside the retention window.
   *
   * Deletion is a soft state here — the row and the profile survive until the
   * retention pass anonymises them — so a deletion made by mistake is
   * recoverable, which is the whole point of holding the row for months. What
   * cannot come back is an anonymised account: the mobile has been replaced with
   * a tombstone and the personal data is gone, so restoring it would produce an
   * empty husk on a number nobody owns.
   *
   * The restored status is derived from the account's own gates rather than
   * remembered: verification and payment timestamps are what decide whether a
   * member can browse, and inventing ACTIVE for somebody who never paid would
   * hand them access they never earned.
   *
   * The profile is un-deleted with the account. Its moderation status is left
   * alone — restoring an account is not a review decision, so a DRAFT stays DRAFT
   * and the member submits again through the ordinary flow.
   */
  async restoreUser(
    id: string,
    input: AdminRestoreUserInput,
    actingAdminId: string,
  ): Promise<AdminRestoreUserView> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        deletedAt: true,
        purgeAfter: true,
        isAnonymised: true,
        identityVerifiedAt: true,
        setupFeePaidAt: true,
      },
    });
    if (!row) {
      throw new NotFoundException('User not found');
    }

    if (row.isAnonymised) {
      throw new ConflictException(
        'This account was anonymised after its retention window and cannot be restored',
      );
    }
    if (row.deletedAt === null && row.status !== 'DELETED') {
      throw new ConflictException('This account is not deleted');
    }

    const now = this.clock.now();
    const status =
      row.identityVerifiedAt !== null && row.setupFeePaidAt !== null
        ? 'ACTIVE'
        : 'PENDING_VERIFICATION';

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          status: status as never,
          deletedAt: null,
          purgeAfter: null,
          deletionRequestedAt: null,
          // The lock and the counters describe attempts against an account that
          // no longer exists; carrying them into the restored one would leave a
          // member locked out of the account they just recovered.
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.profile.updateMany({
        where: { userId: id, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'user:restore',
      resourceType: 'User',
      resourceId: id,
      previousValue: {
        status: row.status,
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      },
      newValue: { status },
      reason: input.reason,
    });

    return {
      userId: id,
      status,
      restoredAt: now.toISOString(),
      restoredByAdminId: actingAdminId,
    };
  }

  async listReports(limit = 20, cursor?: string, status?: ReportStatus) {
    const take = Math.min(limit, 100);
    const items = await this.prisma.report.findMany({
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      select: REPORT_SELECT,
    });
    const hasMore = items.length > take;
    const rows = hasMore ? items.slice(0, take) : items;
    const reports = rows.map(toReportView);
    const nextCursor = hasMore ? (reports[reports.length - 1]?.id ?? null) : null;
    return { reports, nextCursor, hasMore };
  }

  /** One report in full, as a moderation deep link opens it. */
  async getReport(id: string): Promise<AdminReportView> {
    const report = await this.prisma.report.findUnique({ where: { id }, select: REPORT_SELECT });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return toReportView(report);
  }

  /**
   * Section 30: resolve a report.
   *
   * Terminal, like the data-request queue: a report already dismissed or actioned
   * has been decided, so a second call is a conflict rather than a rewrite that
   * could silently change a sanction. `SUSPEND` suspends the reported account as
   * its only side effect, and it is guarded on the account not already being
   * deleted — a moderation decision must not resurrect an erasure into a
   * suspension. The report write, the suspension and the audit are one step.
   */
  async reviewReport(
    id: string,
    input: AdminReviewReportInput,
    actingAdminId: string,
  ): Promise<AdminReportView> {
    const report = await this.prisma.report.findUnique({
      where: { id },
      select: { id: true, status: true, reportedUserId: true, reporterId: true },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    if (report.status === 'DISMISSED' || report.status === 'ACTIONED') {
      throw new ConflictException('Report is already resolved');
    }

    const now = this.clock.now();
    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: input.status,
        actionTaken: input.action,
        reviewNotes: input.notes ?? null,
        resolvedAt: now,
        resolvedByAdminId: actingAdminId,
      },
      select: REPORT_SELECT,
    });

    let suspended = false;
    if (input.action === 'SUSPEND' && report.reportedUserId) {
      const result = await this.prisma.user.updateMany({
        where: { id: report.reportedUserId, status: { not: UserStatus.DELETED } },
        data: { status: UserStatus.SUSPENDED },
      });
      suspended = result.count > 0;
    }

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'report:review',
      resourceType: 'Report',
      resourceId: id,
      previousValue: { status: report.status },
      newValue: { status: input.status, action: input.action, suspended },
      reason: input.notes ?? null,
    });

    await this.notifyReviewOutcome(report, input.status, suspended);

    return toReportView(updated);
  }

  /**
   * Section 42: the two people a review decision concerns are told about it.
   *
   * The reporter hears that action was taken and nothing more — not which action,
   * not who was reported, and not any review note. That is section 30 material;
   * a reporter who is told the sanction would learn things about another member
   * that no report entitles them to. A dismissal says nothing at all, because
   * `REPORT_ACTION_TAKEN` would then be a lie.
   *
   * The suspended member is told their own outcome, which is theirs to know, and
   * is not told who complained.
   *
   * Best-effort: the decision is already committed and audited, and a notification
   * failing must not turn a completed review into an error the console retries.
   */
  private async notifyReviewOutcome(
    report: { reporterId: string | null; reportedUserId: string | null },
    status: string,
    suspended: boolean,
  ): Promise<void> {
    try {
      if (status === 'ACTIONED' && report.reporterId) {
        await this.notifications.create({
          userId: report.reporterId,
          event: NOTIFICATION_EVENTS.REPORT_ACTION_TAKEN,
          channel: 'PUSH',
          title: 'We acted on your report',
          body: 'Our moderation team reviewed the profile you reported and took action.',
        });
      }

      if (suspended && report.reportedUserId) {
        await this.notifications.create({
          userId: report.reportedUserId,
          event: NOTIFICATION_EVENTS.ACCOUNT_SUSPENDED,
          channel: 'PUSH',
          title: 'Your account is suspended',
          body: 'Your account has been suspended after a review. Contact support if you believe this is a mistake.',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not record the review notifications: ${message}`);
    }
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
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: ADMIN_SELECT,
    });
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
