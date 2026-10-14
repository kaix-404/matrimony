import { SetMetadata } from '@nestjs/common';
import type { AdminPermissionKey } from '@matrimony/shared';

/**
 * Metadata key read by `PermissionsGuard`.
 *
 * Exported so the guard and this decorator cannot disagree about the string, and
 * so a test can set metadata without importing the whole guard.
 */
export const PERMISSIONS_METADATA_KEY = 'admin:required-permissions';

/**
 * Declares the permissions a handler requires.
 *
 * Section 33: the check is on permission keys, not role names. A handler with no
 * `@RequirePermission()` passes the permission guard, which is intentional: the
 * guard's job is the extra, per-action grant, and authentication is already
 * enforced by `AdminAuthGuard`. Separating the two is what lets an
 * authenticated-but-unprivileged admin reach, say, their own profile while being
 * refused a category change.
 */
export const RequirePermission = (...permissions: AdminPermissionKey[]) =>
  SetMetadata(PERMISSIONS_METADATA_KEY, permissions);
