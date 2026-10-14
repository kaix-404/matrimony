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
import { ADMIN_ROLE_SLUGS } from '../enums.js';

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
 * Paging for the admin user list.
 *
 * `limit` is coerced because query parameters arrive as strings, and capped at
 * 100 so a single request cannot ask the database to scan the whole user table.
 * Not `.strict()`: a query string may legitimately carry extra tracking
 * parameters, and rejecting those would break a working client.
 */
export const AdminListUsersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  cursor: z.string().min(1).optional(),
});
export type AdminListUsersQuery = z.infer<typeof AdminListUsersQuerySchema>;
