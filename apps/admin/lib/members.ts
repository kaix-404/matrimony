import { ADMIN_USER_STATUSES, type AdminUserStatus } from '@matrimony/shared';

/**
 * Presentation helpers for the member list (section 24).
 *
 * The labels describe what is happening to the member rather than naming the
 * enum, because "Verifying identity" is the answer to "why can't they browse"
 * and `PENDING_VERIFICATION` is not.
 */

export const ADMIN_USER_STATUS_LABELS: Record<AdminUserStatus, string> = {
  PENDING_CATEGORY: 'Choosing category',
  PENDING_VERIFICATION: 'Verifying identity',
  AWAITING_SETUP_FEE: 'Setup fee due',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DELETED: 'Deleted',
};

/** The states in the order the filter chips show them, earliest first. */
export const ADMIN_USER_STATUS_FILTERS: AdminUserStatus[] = [...ADMIN_USER_STATUSES];

const TONES: Record<AdminUserStatus, string> = {
  PENDING_CATEGORY: 'badge-review',
  PENDING_VERIFICATION: 'badge-review',
  AWAITING_SETUP_FEE: 'badge-open',
  ACTIVE: 'badge-ok',
  SUSPENDED: 'badge-danger',
  DELETED: 'badge-closed',
};

/** Narrows a query-string value to a state the list can filter on. */
export function isAdminUserStatus(value: string | undefined): value is AdminUserStatus {
  return value !== undefined && (ADMIN_USER_STATUSES as readonly string[]).includes(value);
}

/**
 * A label for a status this build may not know.
 *
 * The API is the authority on the lifecycle, so a state added there must still
 * render: showing the raw value is worse English but never hides an account.
 */
export function memberStatusLabel(status: string): string {
  return isAdminUserStatus(status) ? ADMIN_USER_STATUS_LABELS[status] : status;
}

/** A badge tone for a status this build may not know, defaulting to neutral. */
export function memberStatusTone(status: string): string {
  return isAdminUserStatus(status) ? TONES[status] : 'badge-closed';
}
