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
import { type AdminRoleSlug, type DataRequestStatus, type DataRequestType, type ReportActionType, type ReportStatus } from '../enums.js';
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
export declare const ADMIN_PERMISSIONS: {
    readonly 'user:read': {
        readonly resource: "user";
        readonly action: "read";
        readonly sensitive: false;
        readonly description: "View user accounts";
    };
    readonly 'user:suspend': {
        readonly resource: "user";
        readonly action: "suspend";
        readonly sensitive: true;
        readonly description: "Suspend an account";
    };
    readonly 'user:delete': {
        readonly resource: "user";
        readonly action: "delete";
        readonly sensitive: true;
        readonly description: "Delete an account";
    };
    readonly 'user:change_category': {
        readonly resource: "user";
        readonly action: "change_category";
        readonly sensitive: true;
        readonly description: "Move a user between net-worth categories (F2(a): Super Admin only)";
    };
    readonly 'profile:read': {
        readonly resource: "profile";
        readonly action: "read";
        readonly sensitive: false;
        readonly description: "View profiles";
    };
    readonly 'profile:approve': {
        readonly resource: "profile";
        readonly action: "approve";
        readonly sensitive: false;
        readonly description: "Approve a profile";
    };
    readonly 'profile:reject': {
        readonly resource: "profile";
        readonly action: "reject";
        readonly sensitive: false;
        readonly description: "Reject a profile";
    };
    readonly 'profile:suspend': {
        readonly resource: "profile";
        readonly action: "suspend";
        readonly sensitive: true;
        readonly description: "Suspend a profile";
    };
    readonly 'photo:review': {
        readonly resource: "photo";
        readonly action: "review";
        readonly sensitive: false;
        readonly description: "Approve or reject a photo";
    };
    readonly 'payment:read': {
        readonly resource: "payment";
        readonly action: "read";
        readonly sensitive: false;
        readonly description: "View payments";
    };
    readonly 'payment:refund': {
        readonly resource: "payment";
        readonly action: "refund";
        readonly sensitive: true;
        readonly description: "Refund a payment";
    };
    readonly 'unlock:read': {
        readonly resource: "unlock";
        readonly action: "read";
        readonly sensitive: false;
        readonly description: "View contact unlocks";
    };
    readonly 'unlock:grant': {
        readonly resource: "unlock";
        readonly action: "grant";
        readonly sensitive: true;
        readonly description: "Grant an unlock without payment (F2(a): Super Admin only, always audited)";
    };
    readonly 'report:review': {
        readonly resource: "report";
        readonly action: "review";
        readonly sensitive: false;
        readonly description: "Review and resolve a report";
    };
    readonly 'pricing:read': {
        readonly resource: "pricing";
        readonly action: "read";
        readonly sensitive: false;
        readonly description: "View pricing versions";
    };
    readonly 'pricing:write': {
        readonly resource: "pricing";
        readonly action: "write";
        readonly sensitive: true;
        readonly description: "Publish a pricing version (F2(a): Super Admin only)";
    };
    readonly 'notification:send': {
        readonly resource: "notification";
        readonly action: "send";
        readonly sensitive: false;
        readonly description: "Compose and send an announcement";
    };
    readonly 'audit:read': {
        readonly resource: "audit";
        readonly action: "read";
        readonly sensitive: false;
        readonly description: "Read the audit log";
    };
    readonly 'data_request:handle': {
        readonly resource: "data_request";
        readonly action: "handle";
        readonly sensitive: true;
        readonly description: "Fulfil a data export/erasure request";
    };
    readonly 'identity_verify:read': {
        readonly resource: "identity_verify";
        readonly action: "read";
        readonly sensitive: false;
        readonly description: "View members' identity-verification state and failure reasons";
    };
    readonly 'identity_verify:review': {
        readonly resource: "identity_verify";
        readonly action: "review";
        readonly sensitive: true;
        readonly description: "Approve or reject an identity verification";
    };
    readonly 'admin:manage': {
        readonly resource: "admin";
        readonly action: "manage";
        readonly sensitive: true;
        readonly description: "Grant or revoke admin roles";
    };
};
/** Every valid permission key. A guard can require nothing outside this union. */
export type AdminPermissionKey = keyof typeof ADMIN_PERMISSIONS;
export declare const AdminPermissionKeySchema: z.ZodEnum<["user:read" | "user:suspend" | "user:delete" | "user:change_category" | "profile:read" | "profile:approve" | "profile:reject" | "profile:suspend" | "photo:review" | "payment:read" | "payment:refund" | "unlock:read" | "unlock:grant" | "report:review" | "pricing:read" | "pricing:write" | "notification:send" | "audit:read" | "data_request:handle" | "identity_verify:read" | "identity_verify:review" | "admin:manage", ...("user:read" | "user:suspend" | "user:delete" | "user:change_category" | "profile:read" | "profile:approve" | "profile:reject" | "profile:suspend" | "photo:review" | "payment:read" | "payment:refund" | "unlock:read" | "unlock:grant" | "report:review" | "pricing:read" | "pricing:write" | "notification:send" | "audit:read" | "data_request:handle" | "identity_verify:read" | "identity_verify:review" | "admin:manage")[]]>;
export declare const AdminRoleSlugSchema: z.ZodEnum<["SUPER_ADMIN", "ADMIN", "MODERATION_ADMIN", "FINANCE_ADMIN"]>;
/** The resolved `Permission` rows the seed should create. */
export declare function permissionCatalogueRows(): Array<{
    key: AdminPermissionKey;
    resource: string;
    action: string;
    description: string;
    isSensitive: boolean;
}>;
/**
 * Admins authenticate with email and password, unlike members (section 6).
 *
 * The minimum password length is enforced here so the API and any admin client
 * reject the same short secret; the record itself stores only a hash.
 */
export declare const AdminLoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
export declare const AdminTokenPairSchema: z.ZodObject<{
    access_token: z.ZodString;
    refresh_token: z.ZodString;
    token_type: z.ZodLiteral<"Bearer">;
    expires_in: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    access_token: string;
    refresh_token: string;
    token_type: "Bearer";
    expires_in: number;
}, {
    access_token: string;
    refresh_token: string;
    token_type: "Bearer";
    expires_in: number;
}>;
export type AdminTokenPair = z.infer<typeof AdminTokenPairSchema>;
export declare const AdminRefreshSchema: z.ZodObject<{
    refresh_token: z.ZodString;
}, "strict", z.ZodTypeAny, {
    refresh_token: string;
}, {
    refresh_token: string;
}>;
export type AdminRefreshInput = z.infer<typeof AdminRefreshSchema>;
/**
 * A six-digit TOTP code. The regex is the whole check: length and alphabet, no
 * arithmetic, because a wrong-but-well-formed code is a normal rejection rather
 * than a validation error.
 */
export declare const AdminMfaCodeSchema: z.ZodString;
export type AdminMfaCode = z.infer<typeof AdminMfaCodeSchema>;
/**
 * The result of a password check when the administrator has MFA enabled.
 *
 * When MFA is off, login answers with a plain `AdminTokenPair` as before; when it
 * is on, it answers with this instead. `mfa_required: true` is the discriminator,
 * so a client written against the old shape sees an object it does not recognise
 * rather than a token pair it would wrongly treat as a session.
 */
export declare const AdminMfaChallengeSchema: z.ZodObject<{
    mfa_required: z.ZodLiteral<true>;
    challenge_token: z.ZodString;
    expires_in: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    expires_in: number;
    mfa_required: true;
    challenge_token: string;
}, {
    expires_in: number;
    mfa_required: true;
    challenge_token: string;
}>;
export type AdminMfaChallenge = z.infer<typeof AdminMfaChallengeSchema>;
/** Login returns either a session or a challenge, never both. */
export declare const AdminLoginResponseSchema: z.ZodUnion<[z.ZodObject<{
    access_token: z.ZodString;
    refresh_token: z.ZodString;
    token_type: z.ZodLiteral<"Bearer">;
    expires_in: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    access_token: string;
    refresh_token: string;
    token_type: "Bearer";
    expires_in: number;
}, {
    access_token: string;
    refresh_token: string;
    token_type: "Bearer";
    expires_in: number;
}>, z.ZodObject<{
    mfa_required: z.ZodLiteral<true>;
    challenge_token: z.ZodString;
    expires_in: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    expires_in: number;
    mfa_required: true;
    challenge_token: string;
}, {
    expires_in: number;
    mfa_required: true;
    challenge_token: string;
}>]>;
export type AdminLoginResponse = z.infer<typeof AdminLoginResponseSchema>;
/** Completes an MFA login: the challenge from `/login` plus a current code. */
export declare const AdminMfaVerifySchema: z.ZodObject<{
    challenge_token: z.ZodString;
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
    challenge_token: string;
}, {
    code: string;
    challenge_token: string;
}>;
export type AdminMfaVerifyInput = z.infer<typeof AdminMfaVerifySchema>;
/**
 * Enrollment step one. The server returns the secret in both raw and `otpauth://`
 * form; the confirming code travels in the `activate` call, and the secret is
 * only persisted once that code proves the authenticator was set up.
 */
export declare const AdminMfaSetupViewSchema: z.ZodObject<{
    secret: z.ZodString;
    otpauth_uri: z.ZodString;
    enrollment_token: z.ZodString;
    expires_in: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    expires_in: number;
    secret: string;
    otpauth_uri: string;
    enrollment_token: string;
}, {
    expires_in: number;
    secret: string;
    otpauth_uri: string;
    enrollment_token: string;
}>;
export type AdminMfaSetupView = z.infer<typeof AdminMfaSetupViewSchema>;
/** Enrollment step two: proves the authenticator holds the secret. */
export declare const AdminMfaActivateSchema: z.ZodObject<{
    enrollment_token: z.ZodString;
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
    enrollment_token: string;
}, {
    code: string;
    enrollment_token: string;
}>;
export type AdminMfaActivateInput = z.infer<typeof AdminMfaActivateSchema>;
export declare const AdminMfaActivateViewSchema: z.ZodObject<{
    mfa_enabled: z.ZodLiteral<true>;
}, "strict", z.ZodTypeAny, {
    mfa_enabled: true;
}, {
    mfa_enabled: true;
}>;
export type AdminMfaActivateView = z.infer<typeof AdminMfaActivateViewSchema>;
/** Turning MFA off requires a current code, so a stolen session is not enough. */
export declare const AdminMfaDisableSchema: z.ZodObject<{
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
export type AdminMfaDisableInput = z.infer<typeof AdminMfaDisableSchema>;
export declare const AdminMfaDisableViewSchema: z.ZodObject<{
    mfa_enabled: z.ZodLiteral<false>;
}, "strict", z.ZodTypeAny, {
    mfa_enabled: false;
}, {
    mfa_enabled: false;
}>;
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
export declare const AdminPrincipalSchema: z.ZodObject<{
    id: z.ZodString;
    roles: z.ZodArray<z.ZodEnum<["SUPER_ADMIN", "ADMIN", "MODERATION_ADMIN", "FINANCE_ADMIN"]>, "many">;
}, "strict", z.ZodTypeAny, {
    id: string;
    roles: ("SUPER_ADMIN" | "ADMIN" | "MODERATION_ADMIN" | "FINANCE_ADMIN")[];
}, {
    id: string;
    roles: ("SUPER_ADMIN" | "ADMIN" | "MODERATION_ADMIN" | "FINANCE_ADMIN")[];
}>;
export type AdminPrincipalShape = z.infer<typeof AdminPrincipalSchema>;
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
    profile: {
        id: string;
        status: string;
        visibility: string;
    } | null;
}
/**
 * The account lifecycle states the member list can filter on.
 *
 * Declared here rather than reused from the auth contract because this is a
 * query surface: making a new state searchable should be a deliberate edit, not
 * something a schema change elsewhere switches on by accident.
 */
export declare const ADMIN_USER_STATUSES: readonly ["PENDING_CATEGORY", "PENDING_VERIFICATION", "AWAITING_SETUP_FEE", "ACTIVE", "SUSPENDED", "DELETED"];
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
export declare const AdminListUsersQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    cursor: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["PENDING_CATEGORY", "PENDING_VERIFICATION", "AWAITING_SETUP_FEE", "ACTIVE", "SUSPENDED", "DELETED"]>>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    status?: "PENDING_CATEGORY" | "PENDING_VERIFICATION" | "AWAITING_SETUP_FEE" | "ACTIVE" | "SUSPENDED" | "DELETED" | undefined;
    cursor?: string | undefined;
    q?: string | undefined;
}, {
    status?: "PENDING_CATEGORY" | "PENDING_VERIFICATION" | "AWAITING_SETUP_FEE" | "ACTIVE" | "SUSPENDED" | "DELETED" | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
    q?: string | undefined;
}>;
export type AdminListUsersQuery = z.infer<typeof AdminListUsersQuerySchema>;
/**
 * The four states a stored row can hold.
 *
 * `NOT_STARTED` is deliberately absent. It is the answer the member-facing status
 * endpoint gives for an account with no verification row at all, so it is not a
 * value this list can filter on — asking for it could only ever return nothing.
 */
export declare const ADMIN_VERIFICATION_STATUSES: readonly ["PENDING", "VERIFIED", "FAILED", "EXPIRED"];
export type AdminVerificationStatus = (typeof ADMIN_VERIFICATION_STATUSES)[number];
export declare const AdminListVerificationsQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    cursor: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["PENDING", "VERIFIED", "FAILED", "EXPIRED"]>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    status?: "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED" | undefined;
    cursor?: string | undefined;
}, {
    status?: "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED" | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
}>;
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
/**
 * Creating an administrator.
 *
 * The password floor is 12 here, above the 8 on login: a login only has to match
 * an existing secret, while a create is where a weak secret is first accepted,
 * and a weak admin credential is the single most valuable thing to guess. At
 * least one role is required — an administrator with no role can sign in and do
 * nothing, which is a support ticket rather than an account.
 */
export declare const AdminCreateSchema: z.ZodEffects<z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
    password: z.ZodString;
    roles: z.ZodArray<z.ZodEnum<["SUPER_ADMIN", "ADMIN", "MODERATION_ADMIN", "FINANCE_ADMIN"]>, "many">;
}, "strict", z.ZodTypeAny, {
    email: string;
    password: string;
    roles: ("SUPER_ADMIN" | "ADMIN" | "MODERATION_ADMIN" | "FINANCE_ADMIN")[];
    name: string;
}, {
    email: string;
    password: string;
    roles: ("SUPER_ADMIN" | "ADMIN" | "MODERATION_ADMIN" | "FINANCE_ADMIN")[];
    name: string;
}>, {
    email: string;
    password: string;
    roles: ("SUPER_ADMIN" | "ADMIN" | "MODERATION_ADMIN" | "FINANCE_ADMIN")[];
    name: string;
}, {
    email: string;
    password: string;
    roles: ("SUPER_ADMIN" | "ADMIN" | "MODERATION_ADMIN" | "FINANCE_ADMIN")[];
    name: string;
}>;
export type AdminCreateInput = z.infer<typeof AdminCreateSchema>;
export declare const AdminAssignRoleSchema: z.ZodObject<{
    role: z.ZodEnum<["SUPER_ADMIN", "ADMIN", "MODERATION_ADMIN", "FINANCE_ADMIN"]>;
}, "strict", z.ZodTypeAny, {
    role: "SUPER_ADMIN" | "ADMIN" | "MODERATION_ADMIN" | "FINANCE_ADMIN";
}, {
    role: "SUPER_ADMIN" | "ADMIN" | "MODERATION_ADMIN" | "FINANCE_ADMIN";
}>;
export type AdminAssignRoleInput = z.infer<typeof AdminAssignRoleSchema>;
export declare const AdminListAdminsQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    cursor: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    cursor?: string | undefined;
}, {
    limit?: number | undefined;
    cursor?: string | undefined;
}>;
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
/**
 * Section 25: move a user between net-worth categories.
 *
 * Both fields are required. The category is *not* the numeric net worth — it is
 * a key into `net_worth_category_ref`, validated server-side, so a client cannot
 * invent a band. `reason` is mandatory because a category change is an
 * access-control decision (section 3): without a reason the audit row cannot
 * explain why a user's visibility scope changed.
 */
export declare const AdminChangeCategorySchema: z.ZodObject<{
    category: z.ZodString;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    category: string;
    reason: string;
}, {
    category: string;
    reason: string;
}>;
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
export declare const AdminPublishPricingSchema: z.ZodObject<{
    category: z.ZodString;
    baseAmount: z.ZodString;
    gstPercent: z.ZodNumber;
    note: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    category: string;
    baseAmount: string;
    gstPercent: number;
    note?: string | undefined;
}, {
    category: string;
    baseAmount: string;
    gstPercent: number;
    note?: string | undefined;
}>;
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
export declare const AdminGrantUnlockSchema: z.ZodObject<{
    profileId: z.ZodString;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reason: string;
    profileId: string;
}, {
    reason: string;
    profileId: string;
}>;
export type AdminGrantUnlockInput = z.infer<typeof AdminGrantUnlockSchema>;
export interface AdminGrantUnlockView {
    profileId: string;
    targetUserId: string;
    grantedAt: string;
    expiresAt: string;
    reason: string;
}
export declare const AdminListDataRequestsQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["REQUESTED", "IN_PROGRESS", "COMPLETED", "REJECTED"]>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    cursor: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    status?: "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | undefined;
    cursor?: string | undefined;
}, {
    status?: "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
}>;
export type AdminListDataRequestsQuery = z.infer<typeof AdminListDataRequestsQuerySchema>;
/**
 * Resolving a data request.
 *
 * Only `COMPLETED` and `REJECTED` are terminal, so only those are accepted: a
 * request cannot be moved back to `REQUESTED` once an administrator has touched
 * it. A rejection must carry notes, because a refused erasure request is exactly
 * the decision a data subject is entitled to see explained.
 */
export declare const AdminResolveDataRequestSchema: z.ZodEffects<z.ZodObject<{
    status: z.ZodEnum<["COMPLETED", "REJECTED"]>;
    resolutionNotes: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status: "COMPLETED" | "REJECTED";
    resolutionNotes?: string | undefined;
}, {
    status: "COMPLETED" | "REJECTED";
    resolutionNotes?: string | undefined;
}>, {
    status: "COMPLETED" | "REJECTED";
    resolutionNotes?: string | undefined;
}, {
    status: "COMPLETED" | "REJECTED";
    resolutionNotes?: string | undefined;
}>;
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
/** Paging plus an optional lifecycle filter for the moderation queue. */
export declare const AdminListReportsQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["OPEN", "IN_REVIEW", "DISMISSED", "ACTIONED"]>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    cursor: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    status?: "OPEN" | "IN_REVIEW" | "DISMISSED" | "ACTIONED" | undefined;
    cursor?: string | undefined;
}, {
    status?: "OPEN" | "IN_REVIEW" | "DISMISSED" | "ACTIONED" | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
}>;
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
export declare const AdminReviewReportSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    status: z.ZodEnum<["DISMISSED", "ACTIONED"]>;
    action: z.ZodEnum<["DISMISS", "WARN", "SUSPEND", "BLOCK", "DELETE"]>;
    notes: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status: "DISMISSED" | "ACTIONED";
    action: "DISMISS" | "WARN" | "SUSPEND" | "BLOCK" | "DELETE";
    notes?: string | undefined;
}, {
    status: "DISMISSED" | "ACTIONED";
    action: "DISMISS" | "WARN" | "SUSPEND" | "BLOCK" | "DELETE";
    notes?: string | undefined;
}>, {
    status: "DISMISSED" | "ACTIONED";
    action: "DISMISS" | "WARN" | "SUSPEND" | "BLOCK" | "DELETE";
    notes?: string | undefined;
}, {
    status: "DISMISSED" | "ACTIONED";
    action: "DISMISS" | "WARN" | "SUSPEND" | "BLOCK" | "DELETE";
    notes?: string | undefined;
}>, {
    status: "DISMISSED" | "ACTIONED";
    action: "DISMISS" | "WARN" | "SUSPEND" | "BLOCK" | "DELETE";
    notes?: string | undefined;
}, {
    status: "DISMISSED" | "ACTIONED";
    action: "DISMISS" | "WARN" | "SUSPEND" | "BLOCK" | "DELETE";
    notes?: string | undefined;
}>;
export type AdminReviewReportInput = z.infer<typeof AdminReviewReportSchema>;
//# sourceMappingURL=admin.d.ts.map