import type { Request } from 'express';
import type { AdminPrincipal } from '@matrimony/shared';

/**
 * Express request augmented by `AdminAuthGuard`.
 *
 * Kept separate from `AuthenticatedRequest` (the member one) on purpose: the two
 * guards populate different properties, and a single interface carrying both
 * `auth` and `admin` invites a handler that reads the wrong one.
 */
export interface AdminRequest extends Request {
  admin?: AdminPrincipal;
}
