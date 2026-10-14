/**
 * Session cookie names and lifetimes, shared by the route handlers, the
 * middleware and the server components.
 *
 * The access token lives in an httpOnly cookie that client JavaScript cannot
 * read. The dashboard never handles a token in the browser: every API call is
 * made by a server component or a route handler, which reads the cookie and
 * attaches the bearer header itself. That is the whole reason the token is kept
 * out of reach of `document.cookie` - an XSS bug in a dashboard view cannot
 * exfiltrate an administrator's session.
 *
 * The email cookie is the one exception: it is deliberately readable so the
 * header can greet the signed-in administrator without a round trip to the API,
 * and an email address is already known to its owner.
 */

/** The admin access token (JWT). Mirrors `JWT_ACCESS_TTL` (15m) on the API. */
export const ACCESS_COOKIE = 'mny_admin_at';

/** The admin refresh token, used only by the middleware to silently re-issue. */
export const REFRESH_COOKIE = 'mny_admin_rt';

/** The signed-in administrator's email, for display only. Readable by design. */
export const EMAIL_COOKIE = 'mny_admin_email';

/** Matches the API's `JWT_ACCESS_TTL` default of 15 minutes. */
export const ACCESS_TTL_SECONDS = 15 * 60;

/** Matches the API's `JWT_REFRESH_TTL` default of 30 days. */
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * The middleware refreshes when the access token has less than this long left,
 * so a request never leaves the browser carrying a token that expires while the
 * API is checking it.
 */
export const REFRESH_SKEW_SECONDS = 60;

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
}

/**
 * `secure` is on in production so the token is never sent over plain HTTP. It is
 * off in development, where the dashboard is reached over http://localhost and a
 * secure cookie would simply be dropped.
 */
export function cookieOptions(maxAge: number, httpOnly: boolean): CookieOptions {
  return {
    httpOnly,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}
