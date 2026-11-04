"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminReviewReportSchema = exports.AdminListReportsQuerySchema = exports.AdminResolveDataRequestSchema = exports.AdminListDataRequestsQuerySchema = exports.AdminGrantUnlockSchema = exports.AdminPublishPricingSchema = exports.AdminChangeCategorySchema = exports.AdminListAdminsQuerySchema = exports.AdminAssignRoleSchema = exports.AdminCreateSchema = exports.AdminListUsersQuerySchema = exports.AdminPrincipalSchema = exports.AdminMfaDisableViewSchema = exports.AdminMfaDisableSchema = exports.AdminMfaActivateViewSchema = exports.AdminMfaActivateSchema = exports.AdminMfaSetupViewSchema = exports.AdminMfaVerifySchema = exports.AdminLoginResponseSchema = exports.AdminMfaChallengeSchema = exports.AdminMfaCodeSchema = exports.AdminRefreshSchema = exports.AdminTokenPairSchema = exports.AdminLoginSchema = exports.AdminRoleSlugSchema = exports.AdminPermissionKeySchema = exports.ADMIN_PERMISSIONS = void 0;
exports.permissionCatalogueRows = permissionCatalogueRows;
const zod_1 = require("zod");
const enums_js_1 = require("../enums.js");
/**
 * Every permission the backend is allowed to check.
 *
 * Kept as a frozen object rather than an array so `keyof typeof` yields the
 * exact union of valid keys, and so a duplicate key is a compile error rather
 * than a silently collapsed array entry. `apps/api/prisma/seed.ts` seeds the
 * `Permission` table from this catalogue, so a key added to a guard but not here
 * cannot be granted, and a key here is always grantable.
 */
exports.ADMIN_PERMISSIONS = {
    'user:read': { resource: 'user', action: 'read', sensitive: false, description: 'View user accounts' },
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
    'profile:read': { resource: 'profile', action: 'read', sensitive: false, description: 'View profiles' },
    'profile:approve': { resource: 'profile', action: 'approve', sensitive: false, description: 'Approve a profile' },
    'profile:reject': { resource: 'profile', action: 'reject', sensitive: false, description: 'Reject a profile' },
    'profile:suspend': {
        resource: 'profile',
        action: 'suspend',
        sensitive: true,
        description: 'Suspend a profile',
    },
    'photo:review': { resource: 'photo', action: 'review', sensitive: false, description: 'Approve or reject a photo' },
    'payment:read': { resource: 'payment', action: 'read', sensitive: false, description: 'View payments' },
    'payment:refund': { resource: 'payment', action: 'refund', sensitive: true, description: 'Refund a payment' },
    'unlock:read': { resource: 'unlock', action: 'read', sensitive: false, description: 'View contact unlocks' },
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
    'pricing:read': { resource: 'pricing', action: 'read', sensitive: false, description: 'View pricing versions' },
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
    'audit:read': { resource: 'audit', action: 'read', sensitive: false, description: 'Read the audit log' },
    'data_request:handle': {
        resource: 'data_request',
        action: 'handle',
        sensitive: true,
        description: 'Fulfil a data export/erasure request',
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
};
exports.AdminPermissionKeySchema = zod_1.z.enum(Object.keys(exports.ADMIN_PERMISSIONS));
exports.AdminRoleSlugSchema = zod_1.z.enum(enums_js_1.ADMIN_ROLE_SLUGS);
/** The resolved `Permission` rows the seed should create. */
function permissionCatalogueRows() {
    return Object.keys(exports.ADMIN_PERMISSIONS).map((key) => {
        const value = exports.ADMIN_PERMISSIONS[key];
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
exports.AdminLoginSchema = zod_1.z
    .object({
    email: zod_1.z.string().trim().toLowerCase().email(),
    password: zod_1.z.string().min(8).max(200),
})
    .strict();
exports.AdminTokenPairSchema = zod_1.z
    .object({
    access_token: zod_1.z.string().min(1),
    refresh_token: zod_1.z.string().min(1),
    token_type: zod_1.z.literal('Bearer'),
    expires_in: zod_1.z.number().int().positive(),
})
    .strict();
exports.AdminRefreshSchema = zod_1.z.object({ refresh_token: zod_1.z.string().min(1) }).strict();
// ---------------------------------------------------------------------------
// MFA (TOTP)
// ---------------------------------------------------------------------------
/**
 * A six-digit TOTP code. The regex is the whole check: length and alphabet, no
 * arithmetic, because a wrong-but-well-formed code is a normal rejection rather
 * than a validation error.
 */
exports.AdminMfaCodeSchema = zod_1.z.string().regex(/^\d{6}$/, 'must be a six-digit code');
/**
 * The result of a password check when the administrator has MFA enabled.
 *
 * When MFA is off, login answers with a plain `AdminTokenPair` as before; when it
 * is on, it answers with this instead. `mfa_required: true` is the discriminator,
 * so a client written against the old shape sees an object it does not recognise
 * rather than a token pair it would wrongly treat as a session.
 */
exports.AdminMfaChallengeSchema = zod_1.z
    .object({
    mfa_required: zod_1.z.literal(true),
    challenge_token: zod_1.z.string().min(1),
    expires_in: zod_1.z.number().int().positive(),
})
    .strict();
/** Login returns either a session or a challenge, never both. */
exports.AdminLoginResponseSchema = zod_1.z.union([exports.AdminTokenPairSchema, exports.AdminMfaChallengeSchema]);
/** Completes an MFA login: the challenge from `/login` plus a current code. */
exports.AdminMfaVerifySchema = zod_1.z
    .object({ challenge_token: zod_1.z.string().min(1), code: exports.AdminMfaCodeSchema })
    .strict();
/**
 * Enrollment step one. The server returns the secret in both raw and `otpauth://`
 * form; the confirming code travels in the `activate` call, and the secret is
 * only persisted once that code proves the authenticator was set up.
 */
exports.AdminMfaSetupViewSchema = zod_1.z
    .object({
    secret: zod_1.z.string().min(1),
    otpauth_uri: zod_1.z.string().min(1),
    enrollment_token: zod_1.z.string().min(1),
    expires_in: zod_1.z.number().int().positive(),
})
    .strict();
/** Enrollment step two: proves the authenticator holds the secret. */
exports.AdminMfaActivateSchema = zod_1.z
    .object({ enrollment_token: zod_1.z.string().min(1), code: exports.AdminMfaCodeSchema })
    .strict();
exports.AdminMfaActivateViewSchema = zod_1.z.object({ mfa_enabled: zod_1.z.literal(true) }).strict();
/** Turning MFA off requires a current code, so a stolen session is not enough. */
exports.AdminMfaDisableSchema = zod_1.z.object({ code: exports.AdminMfaCodeSchema }).strict();
exports.AdminMfaDisableViewSchema = zod_1.z.object({ mfa_enabled: zod_1.z.literal(false) }).strict();
exports.AdminPrincipalSchema = zod_1.z
    .object({
    id: zod_1.z.string().min(1),
    roles: zod_1.z.array(exports.AdminRoleSlugSchema),
})
    .strict();
// ---------------------------------------------------------------------------
// Admin list queries
// ---------------------------------------------------------------------------
/**
 * Paging for the admin user list.
 *
 * `limit` is coerced because query parameters arrive as strings, and capped at
 * 100 so a single request cannot ask the database to scan the whole user table.
 * Not `.strict()`: a query string may legitimately carry extra tracking
 * parameters, and rejecting those would break a working client.
 */
exports.AdminListUsersQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(20),
    cursor: zod_1.z.string().min(1).optional(),
});
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
exports.AdminCreateSchema = zod_1.z
    .object({
    email: zod_1.z.string().trim().toLowerCase().email(),
    name: zod_1.z.string().trim().min(1).max(120),
    password: zod_1.z.string().min(12).max(200),
    roles: zod_1.z.array(exports.AdminRoleSlugSchema).min(1).max(enums_js_1.ADMIN_ROLE_SLUGS.length),
})
    .strict()
    .refine((value) => new Set(value.roles).size === value.roles.length, {
    message: 'roles must not repeat',
    path: ['roles'],
});
exports.AdminAssignRoleSchema = zod_1.z.object({ role: exports.AdminRoleSlugSchema }).strict();
exports.AdminListAdminsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(20),
    cursor: zod_1.z.string().min(1).optional(),
});
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
const RupeesSchema = zod_1.z.string().regex(/^\d+(\.\d{1,2})?$/);
/**
 * Section 25: move a user between net-worth categories.
 *
 * Both fields are required. The category is *not* the numeric net worth — it is
 * a key into `net_worth_category_ref`, validated server-side, so a client cannot
 * invent a band. `reason` is mandatory because a category change is an
 * access-control decision (section 3): without a reason the audit row cannot
 * explain why a user's visibility scope changed.
 */
exports.AdminChangeCategorySchema = zod_1.z
    .object({
    category: zod_1.z.string().trim().min(1).max(64),
    reason: zod_1.z.string().trim().min(1).max(500),
})
    .strict();
/**
 * Section 29: publish a new pricing version.
 *
 * `gstPercent` is a percentage (18 = 18%), converted to the stored fraction
 * server-side, because an administrator thinks in percent while the column is a
 * `Decimal(5,4)` rate. Publishing is append-only: the service closes the current
 * row and opens the next version, so historical payments keep their amount.
 */
exports.AdminPublishPricingSchema = zod_1.z
    .object({
    category: zod_1.z.string().trim().min(1).max(64),
    baseAmount: RupeesSchema,
    gstPercent: zod_1.z.number().min(0).max(100),
    note: zod_1.z.string().trim().max(280).optional(),
})
    .strict();
/**
 * Section 28: grant a contact unlock without a payment.
 *
 * One field names the profile; the owner is resolved server-side, so a caller
 * cannot grant an unlock against a user id that does not own the profile. The
 * reason is mandatory: this is the one path that discloses contact information
 * with no money behind it, and the audit is the only thing that can explain it.
 */
exports.AdminGrantUnlockSchema = zod_1.z
    .object({
    profileId: zod_1.z.string().trim().min(1),
    reason: zod_1.z.string().trim().min(1).max(500),
})
    .strict();
// ---------------------------------------------------------------------------
// Data-subject requests (sections 21, 32)
// ---------------------------------------------------------------------------
exports.AdminListDataRequestsQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(enums_js_1.DATA_REQUEST_STATUSES).optional(),
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(20),
    cursor: zod_1.z.string().min(1).optional(),
});
/**
 * Resolving a data request.
 *
 * Only `COMPLETED` and `REJECTED` are terminal, so only those are accepted: a
 * request cannot be moved back to `REQUESTED` once an administrator has touched
 * it. A rejection must carry notes, because a refused erasure request is exactly
 * the decision a data subject is entitled to see explained.
 */
exports.AdminResolveDataRequestSchema = zod_1.z
    .object({
    status: zod_1.z.enum(['COMPLETED', 'REJECTED']),
    resolutionNotes: zod_1.z.string().trim().max(2000).optional(),
})
    .strict()
    .refine((value) => value.status !== 'REJECTED' || (value.resolutionNotes ?? '').length > 0, {
    message: 'A rejection requires resolution notes',
    path: ['resolutionNotes'],
});
// ---------------------------------------------------------------------------
// Report review queue (sections 20, 30)
// ---------------------------------------------------------------------------
/** Paging plus an optional lifecycle filter for the moderation queue. */
exports.AdminListReportsQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(enums_js_1.REPORT_STATUSES).optional(),
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(20),
    cursor: zod_1.z.string().min(1).optional(),
});
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
exports.AdminReviewReportSchema = zod_1.z
    .object({
    status: zod_1.z.enum(['DISMISSED', 'ACTIONED']),
    action: zod_1.z.enum(enums_js_1.REPORT_ACTION_TYPES),
    notes: zod_1.z.string().trim().max(2000).optional(),
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
//# sourceMappingURL=admin.js.map