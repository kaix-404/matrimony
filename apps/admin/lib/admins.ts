import type { AdminRoleSlug, AdminRoleView } from '@matrimony/shared';

/**
 * Shared pieces of the administrator-management forms.
 *
 * The state type lives here rather than beside the actions because a `'use
 * server'` module may only export async functions, and both the server actions
 * and the client forms need to name the same shape.
 */
export interface AdminActionState {
  error: string | null;
}

export const initialAdminActionState: AdminActionState = { error: null };

/** Mirrors `AdminCreateSchema`: the API rejects anything shorter. */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

/**
 * The roles an administrator does not yet hold.
 *
 * The grant control offers only what a grant could actually change: re-granting
 * a held role is a no-op the API answers 200 to, so showing it would invite an
 * operator to "fix" something that is already correct.
 */
export function rolesNotHeld(
  held: readonly AdminRoleSlug[],
  catalogue: readonly AdminRoleView[],
): AdminRoleView[] {
  return catalogue.filter((role) => !held.includes(role.slug));
}

/**
 * True when the row belongs to the signed-in administrator.
 *
 * Role changes and MFA resets refuse a target that is the caller, because doing
 * either to yourself is how an administrator locks themselves (or everyone) out
 * of the console. The API enforces it; the page says so instead of rendering a
 * button that could only fail.
 */
export function isOwnRow(rowId: string, selfId: string | null): boolean {
  return selfId !== null && rowId === selfId;
}
