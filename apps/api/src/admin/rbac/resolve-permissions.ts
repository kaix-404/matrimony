import type { AdminPermissionKey } from '@matrimony/shared';
import type { AdminRoleSlug, PrismaClient } from '../../prisma/prisma-client';

/**
 * The permission keys an administrator holds, resolved from their roles.
 *
 * Shared by `PermissionsGuard` and by the console's `/admin/me` route because
 * there must be exactly one answer to "what may this administrator do". If the
 * console resolved grants its own way, a sidebar could offer a page the guard
 * refuses, or hide one it would allow — and the two would drift apart the first
 * time a grant changed.
 *
 * Roles are OR-ed: holding a permission through any one role is enough, which
 * matches how a super-admin seeded with every role is expected to behave.
 *
 * Read on every call rather than cached or baked into a token: a permission
 * revoked in the database has to stop working on the next request.
 */
export async function resolvePermissionsForRoles(
  prisma: PrismaClient,
  roles: readonly string[],
): Promise<Set<AdminPermissionKey>> {
  if (roles.length === 0) {
    return new Set();
  }

  const grants = await prisma.adminRolePermission.findMany({
    where: { role: { slug: { in: roles as AdminRoleSlug[] } } },
    select: { permission: { select: { key: true } } },
  });

  return new Set(grants.map((grant) => grant.permission.key as AdminPermissionKey));
}
