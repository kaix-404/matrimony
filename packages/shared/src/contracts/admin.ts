/**
 * Admin & RBAC contracts — spec sections 24–33.
 *
 * THE PERMISSION CATALOGUE IS THE CONTRACT
 * ----------------------------------------
 * Section 33 requires that backend checks be permission-based, not role-based,
 * so a guard asks "does this admin hold `user:change_category`?" and never
 * "is this admin an ADMIN?". The catalogue below is the single list of keys that
 * can be granted; the API seeds the `Permission` table from it and guards are
 * annotated with keys from it. A key that is not here cannot be required, which
 * is what stops a typo in a decorator from silently granting access.
 *
 * IS_SENSITIVE mirrors `Permission.isSensitive` in the schema. Section 28 calls
 * out manual unlock grants specifically: a sensitive grant is one that must also
 * write an `AuditLog`/`AdminGrantAudit` row, which is why the flag lives beside
 * the key rather than only in the database.
 */

import { z } from 'zod';
import type { IdentityVerificationProvider, IdentityVerificationVendor } from './verification.js';
import {
  ADMIN_ROLE_SLUGS,
  DATA_REQUEST_STATUSES,
  PHOTO_STATUSES,
  PHOTO_TYPES,
  REPORT_ACTION_TYPES,
  REPORT_STATUSES,
  type AdminRoleSlug,
  type DataRequestStatus,
  type DataRequestType,
  type ReportActionType,
  type ReportStatus,
} from '../enums.js';

export interface AdminPermissionDescriptor {
  /** The noun being acted on, e.g. `user`, `pricing`. */
  readonly resource: string;
  /** The verb, e.g. `read`, `write`, `grant`. */
  readonly action: string;
  /** True when the action must always be audited (section 28/32). */
  readonly sensitive: boolean;
  readonly description: string;
}

/**
 * Every permission the backend is allowed to check.
 *
 * Kept as a frozen object rather than an array so `keyof typeof` yields the
 * exact union of valid keys, and so a duplicate key is a compile error rather
 * than a silently collapsed array entry. `apps/api/prisma/seed.ts` seeds the
 * `Permission` table from this catalogue, so a key added to a guard but not here
 * cannot be granted, and a key here is always grantable.
 */
export const ADMIN_PERMISSIONS = {
  'user:read': {
    resource: 'user',
    action: 'read',
    sensitive: false,
    description: 'View user accounts',
  },
  'user:suspend': {
    resource: 'user',
    action: 'suspend',
    sensitive: true,
    description: 'Suspend an account',
  },
  'user:delete': {
    resource: 'user',
    action: 'delete',
    sensitive: true,
    description: 'Delete an account',
  },
  'user:change_category': {
    resource: 'user',
    action: 'change_category',
    sensitive: true,
    description: 'Move a user between net-worth categories (F2(a): Super Admin only)',
  },
  'profile:read': {
    resource: 'profile',
    action: 'read',
    sensitive: false,
    description: 'View profiles',
  },
  'profile:approve': {
    resource: 'profile',
    action: 'approve',
    sensitive: false,
    description: 'Approve a profile',
  },
  'profile:reject': {
    resource: 'profile',
    action: 'reject',
    sensitive: false,
    description: 'Reject a profile',
  },
  'profile:suspend': {
    resource: 'profile',
    action: 'suspend',
    sensitive: true,
    description: 'Suspend a profile',
  },
  'photo:review': {
    resource: 'photo',
    action: 'review',
    sensitive: false,
    description: 'Approve or reject a photo',
  },
  'payment:read': {
    resource: 'payment',
    action: 'read',
    sensitive: false,
    description: 'View payments',
  },
  'payment:refund': {
    resource: 'payment',
    action: 'refund',
    sensitive: true,
    description: 'Refund a payment',
  },
  'unlock:read': {
    resource: 'unlock',
    action: 'read',
    sensitive: false,
    description: 'View contact unlocks',
  },
  'unlock:grant': {
    resource: 'unlock',
    action: 'grant',
    sensitive: true,
    description: 'Grant an unlock without payment (F2(a): Super Admin only, always audited)',
  },
  'report:review': {
    resource: 'report',
    action: 'review',
    sensitive: false,
    description: 'Review and resolve a report',
  },
  'pricing:read': {
    resource: 'pricing',
    action: 'read',
    sensitive: false,
    description: 'View pricing versions',
  },
  'pricing:write': {
    resource: 'pricing',
    action: 'write',
    sensitive: true,
    description: 'Publish a pricing version (F2(a): Super Admin only)',
  },
  'notification:send': {
    resource: 'notification',
    action: 'send',
    sensitive: false,
    description: 'Compose and send an announcement',
  },
  'audit:read': {
    resource: 'audit',
    action: 'read',
    sensitive: false,
    description: 'Read the audit log',
  },
  'data_request:handle': {
    resource: 'data_request',
    action: 'handle',
    sensitive: true,
    description: 'Fulfil a data export/erasure request',
  },
  'identity_verify:read': {
    resource: 'identity_verify',
    action: 'read',
    sensitive: false,
    description: "View members' identity-verification state and failure reasons",
  },
  'identity_verify:review': {
    resource: 'identity_verify',
    action: 'review',
    sensitive: true,
    description: 'Approve or reject an identity verification',
  },
  'admin:manage': {
    resource: 'admin',
    action: 'manage',
    sensitive: true,
    description: 'Grant or revoke admin roles',
  },
} as const satisfies Record<string, AdminPermissionDescriptor>;

/** Every valid permission key. A guard can require nothing outside this union. */
export type AdminPermissionKey = keyof typeof ADMIN_PERMISSIONS;

export const AdminPermissionKeySchema = z.enum(
  Object.keys(ADMIN_PERMISSIONS) as [AdminPermissionKey, ...AdminPermissionKey[]],
);

export const AdminRoleSlugSchema = z.enum(ADMIN_ROLE_SLUGS);

/** The resolved `Permission` rows the seed should create. */
export function permissionCatalogueRows(): Array<{
  key: AdminPermissionKey;
  resource: string;
  action: string;
  description: string;
  isSensitive: boolean;
}> {
  return (Object.keys(ADMIN_PERMISSIONS) as AdminPermissionKey[]).map((key) => {
    const value = ADMIN_PERMISSIONS[key];
    return {
      key,
      resource: value.resource,
      action: value.action,
      description: value.description,
      isSensitive: value.sensitive,
    };
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Admins authenticate with email and password, unlike members (section 6).
 *
 * The minimum password length is enforced here so the API and any admin client
 * reject the same short secret; the record itself stores only a hash.
 */
export const AdminLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(200),
  })
  .strict();
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;

export const AdminTokenPairSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    token_type: z.literal('Bearer'),
    expires_in: z.number().int().positive(),
  })
  .strict();
export type AdminTokenPair = z.infer<typeof AdminTokenPairSchema>;

export const AdminRefreshSchema = z.object({ refresh_token: z.string().min(1) }).strict();
export type AdminRefreshInput = z.infer<typeof AdminRefreshSchema>;

// ---------------------------------------------------------------------------
// MFA (TOTP)
// ---------------------------------------------------------------------------

/**
 * A six-digit TOTP code. The regex is the whole check: length and alphabet, no
 * arithmetic, because a wrong-but-well-formed code is a normal rejection rather
 * than a validation error.
 */
export const AdminMfaCodeSchema = z.string().regex(/^\d{6}$/, 'must be a six-digit code');
export type AdminMfaCode = z.infer<typeof AdminMfaCodeSchema>;

/**
 * The result of a password check when the administrator has MFA enabled.
 *
 * When MFA is off, login answers with a plain `AdminTokenPair` as before; when it
 * is on, it answers with this instead. `mfa_required: true` is the discriminator,
 * so a client written against the old shape sees an object it does not recognise
 * rather than a token pair it would wrongly treat as a session.
 */
export const AdminMfaChallengeSchema = z
  .object({
    mfa_required: z.literal(true),
    challenge_token: z.string().min(1),
    expires_in: z.number().int().positive(),
  })
  .strict();
export type AdminMfaChallenge = z.infer<typeof AdminMfaChallengeSchema>;

/** Login returns either a session or a challenge, never both. */
export const AdminLoginResponseSchema = z.union([AdminTokenPairSchema, AdminMfaChallengeSchema]);
export type AdminLoginResponse = z.infer<typeof AdminLoginResponseSchema>;

/** Completes an MFA login: the challenge from `/login` plus a current code. */
export const AdminMfaVerifySchema = z
  .object({ challenge_token: z.string().min(1), code: AdminMfaCodeSchema })
  .strict();
export type AdminMfaVerifyInput = z.infer<typeof AdminMfaVerifySchema>;

/**
 * Enrollment step one. The server returns the secret in both raw and `otpauth://`
 * form; the confirming code travels in the `activate` call, and the secret is
 * only persisted once that code proves the authenticator was set up.
 */
export const AdminMfaSetupViewSchema = z
  .object({
    secret: z.string().min(1),
    otpauth_uri: z.string().min(1),
    enrollment_token: z.string().min(1),
    expires_in: z.number().int().positive(),
  })
  .strict();
export type AdminMfaSetupView = z.infer<typeof AdminMfaSetupViewSchema>;

/** Enrollment step two: proves the authenticator holds the secret. */
export const AdminMfaActivateSchema = z
  .object({ enrollment_token: z.string().min(1), code: AdminMfaCodeSchema })
  .strict();
export type AdminMfaActivateInput = z.infer<typeof AdminMfaActivateSchema>;

export const AdminMfaActivateViewSchema = z.object({ mfa_enabled: z.literal(true) }).strict();
export type AdminMfaActivateView = z.infer<typeof AdminMfaActivateViewSchema>;

/** Turning MFA off requires a current code, so a stolen session is not enough. */
export const AdminMfaDisableSchema = z.object({ code: AdminMfaCodeSchema }).strict();
export type AdminMfaDisableInput = z.infer<typeof AdminMfaDisableSchema>;

export const AdminMfaDisableViewSchema = z.object({ mfa_enabled: z.literal(false) }).strict();
export type AdminMfaDisableView = z.infer<typeof AdminMfaDisableViewSchema>;

/**
 * Admin access-token claims.
 *
 * `typ` is `admin_access`, not `access`, so the member guard (which accepts only
 * `access`) can never accept an admin token and vice-versa. `roles` is carried so
 * the permissions guard knows which grants to resolve; it is deliberately roles
 * and not permissions, because a permission added to a role after the token was
 * issued must take effect without waiting for the token to expire.
 */
export interface AdminAccessTokenClaims {
  sub: string;
  typ: 'admin_access';
  roles: string[];
  iat: number;
  exp: number;
}

/** The authenticated administrator as an admin handler sees it. */
export interface AdminPrincipal {
  id: string;
  roles: string[];
}

export const AdminPrincipalSchema = z
  .object({
    id: z.string().min(1),
    roles: z.array(AdminRoleSlugSchema),
  })
  .strict();
export type AdminPrincipalShape = z.infer<typeof AdminPrincipalSchema>;

// ---------------------------------------------------------------------------
// Admin list queries
// ---------------------------------------------------------------------------

/**
 * One member account, as an administrator opens it.
 *
 * It answers the question support is actually asked - "why can this member not
 * browse, or not be found" - so it carries the three gates (phone, identity,
 * setup fee), the net-worth band and the profile's moderation state.
 *
 * It deliberately carries no profile content: no name, no photograph, no
 * contact details, no birth date. Those are a separately permission-checked read
 * (section 13), and this view must not become a way around it. `profile` is the
 * administration metadata only, which is why it can say APPROVED without
 * showing what was approved.
 */
export interface AdminUserDetailView {
  id: string;
  email: string | null;
  mobile: string;
  status: AdminUserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  isPhoneVerified: boolean;
  identityVerifiedAt: string | null;
  setupFeePaidAt: string | null;
  networthCategory: string;
  categoryReviewNote: string | null;
  categoryChangedAt: string | null;
  deletedAt: string | null;
  profile: { id: string; status: string; visibility: string } | null;
}

/**
 * The account lifecycle states the member list can filter on.
 *
 * Declared here rather than reused from the auth contract because this is a
 * query surface: making a new state searchable should be a deliberate edit, not
 * something a schema change elsewhere switches on by accident.
 */
export const ADMIN_USER_STATUSES = [
  'PENDING_CATEGORY',
  'PENDING_VERIFICATION',
  'AWAITING_SETUP_FEE',
  'ACTIVE',
  'SUSPENDED',
  'DELETED',
] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

/**
 * Paging, filtering and search for the admin user list.
 *
 * `limit` is coerced because query parameters arrive as strings, and capped at
 * 100 so a single request cannot ask the database to scan the whole user table.
 * Not `.strict()`: a query string may legitimately carry extra tracking
 * parameters, and rejecting those would break a working client.
 *
 * `q` is the term support types while a member is on the phone: a mobile number
 * or part of an email address. Two characters is the floor because a single one
 * matches nearly every account and scans the whole table to say so, which is
 * both useless and expensive. It is trimmed, so a stray space is not a search.
 */
export const AdminListUsersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  cursor: z.string().min(1).optional(),
  status: z.enum(ADMIN_USER_STATUSES).optional(),
  q: z.string().trim().min(2).max(120).optional(),
});
export type AdminListUsersQuery = z.infer<typeof AdminListUsersQuerySchema>;

// ---------------------------------------------------------------------------
// Identity verification (the D9 read surface, section 24)
// ---------------------------------------------------------------------------

/**
 * The four states a stored row can hold.
 *
 * `NOT_STARTED` is deliberately absent. It is the answer the member-facing status
 * endpoint gives for an account with no verification row at all, so it is not a
 * value this list can filter on — asking for it could only ever return nothing.
 */
export const ADMIN_VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'FAILED', 'EXPIRED'] as const;
export type AdminVerificationStatus = (typeof ADMIN_VERIFICATION_STATUSES)[number];

export const AdminListVerificationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  cursor: z.string().min(1).optional(),
  status: z.enum(ADMIN_VERIFICATION_STATUSES).optional(),
});
export type AdminListVerificationsQuery = z.infer<typeof AdminListVerificationsQuerySchema>;

/**
 * One member's identity check, as support needs to read it: whether it passed,
 * and if it did not, why.
 *
 * Deliberately absent: `nameOnId` (the name printed on the Aadhaar, which the
 * member-facing flow uses only to warn about a mismatch), `providerReference`
 * and `screeningResult`. None of them answers "is this person verified, and if
 * not, what happened", and the first two are supplier-side material that a
 * support screen has no reason to hold. `aadhaarLast4` is carried only because
 * it is already masked to four digits and is how a member identifies the check
 * they are calling about.
 */
export interface AdminVerificationView {
  id: string;
  userId: string;
  /** The member's mobile: the handle they quote when they call in. */
  memberMobile: string;
  /** The account's lifecycle status, so a KYC result is read in context. */
  memberStatus: string;
  provider: IdentityVerificationProvider;
  vendor: IdentityVerificationVendor | null;
  status: AdminVerificationStatus;
  aadhaarLast4: string | null;
  yearOfBirth: number | null;
  failureCode: string | null;
  failureReason: string | null;
  /**
   * When Aadhaar-processing consent was recorded. H3 requires it to precede the
   * supplier call, and this timestamp is how that ordering is checked after the
   * fact rather than assumed.
   */
  consentedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Admin management (section 24: roles and administrators)
// ---------------------------------------------------------------------------

/**
 * Creating an administrator.
 *
 * The password floor is 12 here, above the 8 on login: a login only has to match
 * an existing secret, while a create is where a weak secret is first accepted,
 * and a weak admin credential is the single most valuable thing to guess. At
 * least one role is required — an administrator with no role can sign in and do
 * nothing, which is a support ticket rather than an account.
 */
export const AdminCreateSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(200),
    roles: z.array(AdminRoleSlugSchema).min(1).max(ADMIN_ROLE_SLUGS.length),
  })
  .strict()
  .refine((value) => new Set(value.roles).size === value.roles.length, {
    message: 'roles must not repeat',
    path: ['roles'],
  });
export type AdminCreateInput = z.infer<typeof AdminCreateSchema>;

export const AdminAssignRoleSchema = z.object({ role: AdminRoleSlugSchema }).strict();
export type AdminAssignRoleInput = z.infer<typeof AdminAssignRoleSchema>;

export const AdminListAdminsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  cursor: z.string().min(1).optional(),
});
export type AdminListAdminsQuery = z.infer<typeof AdminListAdminsQuerySchema>;

/** A role and the permissions it currently grants, as the role screen shows it. */
export interface AdminRoleView {
  id: string;
  slug: AdminRoleSlug;
  name: string;
  description: string | null;
  permissions: Array<{
    key: AdminPermissionKey;
    resource: string;
    action: string;
    sensitive: boolean;
  }>;
}

/** An administrator as the admin-management list shows them. Never carries a hash. */
export interface AdminUserView {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: AdminRoleSlug[];
  /** True once TOTP enrollment is confirmed; the secret itself never leaves the server. */
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Audited enrichment actions (F2(a): category, pricing and manual unlock)
// ---------------------------------------------------------------------------

/**
 * A rupee amount with at most two decimals, as a string.
 *
 * Matches the money literal used elsewhere (`UnlockPriceSchema`), and is a
 * string rather than a number so a value like `0.1` never enters the API as a
 * binary float that could round differently on the way to storage.
 */
const RupeesSchema = z.string().regex(/^\d+(\.\d{1,2})?$/);

/**
 * Section 25: move a user between net-worth categories.
 *
 * Both fields are required. The category is *not* the numeric net worth — it is
 * a key into `net_worth_category_ref`, validated server-side, so a client cannot
 * invent a band. `reason` is mandatory because a category change is an
 * access-control decision (section 3): without a reason the audit row cannot
 * explain why a user's visibility scope changed.
 */
export const AdminChangeCategorySchema = z
  .object({
    category: z.string().trim().min(1).max(64),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type AdminChangeCategoryInput = z.infer<typeof AdminChangeCategorySchema>;

export interface AdminCategoryChangeView {
  userId: string;
  previousCategory: string;
  networthCategory: string;
  changedAt: string;
  changedByAdminId: string;
}

/**
 * Section 29: publish a new pricing version.
 *
 * `gstPercent` is a percentage (18 = 18%), converted to the stored fraction
 * server-side, because an administrator thinks in percent while the column is a
 * `Decimal(5,4)` rate. Publishing is append-only: the service closes the current
 * row and opens the next version, so historical payments keep their amount.
 */
export const AdminPublishPricingSchema = z
  .object({
    category: z.string().trim().min(1).max(64),
    baseAmount: RupeesSchema,
    gstPercent: z.number().min(0).max(100),
    note: z.string().trim().max(280).optional(),
  })
  .strict();
export type AdminPublishPricingInput = z.infer<typeof AdminPublishPricingSchema>;

export interface AdminPricingView {
  id: string;
  category: string;
  baseAmount: string;
  gstRate: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdByAdminId: string | null;
  createdAt: string;
}

/**
 * Section 28: grant a contact unlock without a payment.
 *
 * One field names the profile; the owner is resolved server-side, so a caller
 * cannot grant an unlock against a user id that does not own the profile. The
 * reason is mandatory: this is the one path that discloses contact information
 * with no money behind it, and the audit is the only thing that can explain it.
 */
export const AdminGrantUnlockSchema = z
  .object({
    profileId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type AdminGrantUnlockInput = z.infer<typeof AdminGrantUnlockSchema>;

export interface AdminGrantUnlockView {
  profileId: string;
  targetUserId: string;
  grantedAt: string;
  expiresAt: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Data-subject requests (sections 21, 32)
// ---------------------------------------------------------------------------

export const AdminListDataRequestsQuerySchema = z.object({
  status: z.enum(DATA_REQUEST_STATUSES).optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  cursor: z.string().min(1).optional(),
});
export type AdminListDataRequestsQuery = z.infer<typeof AdminListDataRequestsQuerySchema>;

/**
 * Resolving a data request.
 *
 * Only `COMPLETED` and `REJECTED` are terminal, so only those are accepted: a
 * request cannot be moved back to `REQUESTED` once an administrator has touched
 * it. A rejection must carry notes, because a refused erasure request is exactly
 * the decision a data subject is entitled to see explained.
 */
export const AdminResolveDataRequestSchema = z
  .object({
    status: z.enum(['COMPLETED', 'REJECTED']),
    resolutionNotes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((value) => value.status !== 'REJECTED' || (value.resolutionNotes ?? '').length > 0, {
    message: 'A rejection requires resolution notes',
    path: ['resolutionNotes'],
  });
export type AdminResolveDataRequestInput = z.infer<typeof AdminResolveDataRequestSchema>;

export interface AdminDataRequestView {
  id: string;
  userId: string;
  type: DataRequestType;
  status: DataRequestStatus;
  requestedAt: string;
  dueAt: string;
  completedAt: string | null;
  resolutionNotes: string | null;
  handledByAdminId: string | null;
}

// ---------------------------------------------------------------------------
// Report review queue (sections 20, 30)
// ---------------------------------------------------------------------------

/** Paging plus an optional lifecycle filter for the moderation queue. */
export const AdminListReportsQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  cursor: z.string().min(1).optional(),
});
export type AdminListReportsQuery = z.infer<typeof AdminListReportsQuerySchema>;

/**
 * A report as the moderation queue shows it.
 *
 * It carries the reporter and reported **ids** and the free-text description,
 * because an administrator triaging the queue has to be able to decide without a
 * second request — that is the whole point of a queue. It carries no name or
 * photograph: those live on the profile and user endpoints, which are separately
 * permission-checked, so this view cannot leak a section-13 hidden field through
 * a side door.
 */
export interface AdminReportView {
  id: string;
  status: ReportStatus;
  reason_code: string;
  reporter_user_id: string;
  reported_profile_id: string | null;
  reported_user_id: string | null;
  description: string | null;
  review_notes: string | null;
  action_taken: ReportActionType | null;
  resolved_at: string | null;
  resolved_by_admin_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Resolving a report.
 *
 * Only the two terminal states are accepted: a resolution *is* a decision, so
 * "still open" is not something this call can set, exactly as the data-request
 * queue refuses a non-terminal status. `DISMISS` must pair with `DISMISSED` and
 * every other action with `ACTIONED`, so the recorded action and the lifecycle
 * status cannot disagree. Notes are required to action, because a sanction with
 * no recorded reason cannot be reviewed or appealed. `SUSPEND` additionally
 * suspends the reported account; the remaining actions are recorded on the
 * report for the audit trail without an automatic side effect yet.
 */
export const AdminReviewReportSchema = z
  .object({
    status: z.enum(['DISMISSED', 'ACTIONED']),
    action: z.enum(REPORT_ACTION_TYPES),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((value) => (value.action === 'DISMISS') === (value.status === 'DISMISSED'), {
    message: 'A dismissal is filed as DISMISSED; every other action as ACTIONED',
    path: ['status'],
  })
  .refine((value) => value.status !== 'ACTIONED' || (value.notes ?? '').length > 0, {
    message: 'An actioned report requires review notes',
    path: ['notes'],
  });
export type AdminReviewReportInput = z.infer<typeof AdminReviewReportSchema>;

// ---------------------------------------------------------------------------
// Photo review queue (section 9)
// ---------------------------------------------------------------------------

export const AdminListPhotosQuerySchema = z.object({
  status: z.enum(PHOTO_STATUSES).optional().default('PENDING_REVIEW'),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  cursor: z.string().min(1).optional(),
});
export type AdminListPhotosQuery = z.infer<typeof AdminListPhotosQuerySchema>;

/**
 * A photo as the review queue shows it.
 *
 * `url` is a short-lived presigned GET, not an object key: an administrator
 * cannot decide about an image they cannot see, and handing the console the key
 * would either mean it builds its own signed URL (with credentials it must not
 * hold) or that the bucket is public. It expires, like every other image URL in
 * the product (section 41).
 *
 * The ids and the member's first name are enough to triage; the queue does not
 * repeat contact details, which live on the user endpoint behind `user:read`.
 */
export const AdminPhotoViewSchema = z
  .object({
    id: z.string().min(1),
    profile_id: z.string().min(1),
    profile_name: z.string().nullable(),
    status: z.enum(PHOTO_STATUSES),
    photo_type: z.enum(PHOTO_TYPES),
    url: z.string().min(1),
    uploaded_at: z.string().datetime(),
    reviewed_at: z.string().datetime().nullable(),
    rejection_reason: z.string().nullable(),
    reviewed_by_admin_id: z.string().nullable(),
  })
  .strict();
export type AdminPhotoView = z.infer<typeof AdminPhotoViewSchema>;

export const AdminPhotoListResponseSchema = z
  .object({
    photos: z.array(AdminPhotoViewSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .strict();
export type AdminPhotoListResponse = z.infer<typeof AdminPhotoListResponseSchema>;

/**
 * Approving or rejecting one photo.
 *
 * `REJECT` must say why: a rejection with no reason leaves the member looking at
 * a photo that simply vanished, and section 9's rejection path exists precisely
 * so they can be told. `APPROVE` carries no reason, and any sent one is refused
 * rather than stored, so a stale form cannot attach an explanation to an approval.
 */
export const AdminReviewPhotoSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    rejection_reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => value.decision !== 'REJECT' || (value.rejection_reason ?? '').length > 0, {
    message: 'A rejection requires a reason',
    path: ['rejection_reason'],
  })
  .refine((value) => value.decision !== 'APPROVE' || value.rejection_reason === undefined, {
    message: 'An approval carries no rejection reason',
    path: ['rejection_reason'],
  });
export type AdminReviewPhotoInput = z.infer<typeof AdminReviewPhotoSchema>;
