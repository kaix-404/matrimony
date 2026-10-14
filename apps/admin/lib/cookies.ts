import { cookies } from 'next/headers';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  EMAIL_COOKIE,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  cookieOptions,
} from './session';

/**
 * Writes and clears the session cookies from a route handler or server action.
 *
 * This lives apart from `lib/session.ts` because it imports `next/headers`,
 * which is server-only and must never be pulled into the middleware bundle.
 */

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

/** Persists a fresh token pair plus the display-only email. */
export async function writeSessionCookies(pair: TokenPair, email: string): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, pair.access_token, cookieOptions(ACCESS_TTL_SECONDS, true));
  store.set(REFRESH_COOKIE, pair.refresh_token, cookieOptions(REFRESH_TTL_SECONDS, true));
  store.set(EMAIL_COOKIE, email, cookieOptions(REFRESH_TTL_SECONDS, false));
}

/** Removes every session cookie by setting it empty and already expired. */
export async function deleteSessionCookies(): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, '', cookieOptions(0, true));
  store.set(REFRESH_COOKIE, '', cookieOptions(0, true));
  store.set(EMAIL_COOKIE, '', cookieOptions(0, false));
}
