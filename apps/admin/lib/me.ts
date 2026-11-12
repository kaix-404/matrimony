import {
  AdminSessionViewSchema,
  type AdminPermissionKey,
  type AdminSessionView,
} from '@matrimony/shared';
import { adminFetch } from './api';

/**
 * The signed-in administrator, as the API resolves them.
 *
 * The shell reads this to draw a sidebar that matches what the API will actually
 * allow, and the pages that need a specific grant read it to say so instead of
 * rendering a panel that could only fail.
 *
 * A failed or unparseable answer returns `null` rather than throwing. The proxy
 * has already gated the request, a sidebar is not worth failing a page over, and
 * `null` hides the permission-gated links — the safe direction to be wrong in.
 */
export async function currentAdmin(): Promise<AdminSessionView | null> {
  try {
    const session = await adminFetch<unknown>('/admin/me');
    const parsed = AdminSessionViewSchema.safeParse(session);
    return parsed.success ? parsed.data : null;
  } catch {
    // Includes the 401 of a session whose administrator was removed: the proxy
    // and the API will bounce the next navigation to the login page.
    return null;
  }
}

/** True only when the API confirmed the grant; an unknown session holds nothing. */
export function holdsPermission(
  session: AdminSessionView | null,
  permission: AdminPermissionKey,
): boolean {
  return session?.permissions.includes(permission) ?? false;
}
