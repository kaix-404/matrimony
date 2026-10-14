import { NextResponse, type NextRequest } from 'next/server';
import { API_BASE_URL } from './lib/env';
import { isFresh } from './lib/jwt';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_SKEW_SECONDS,
  REFRESH_TTL_SECONDS,
  cookieOptions,
} from './lib/session';

/**
 * The dashboard's edge gate (Next's renamed middleware convention).
 *
 * Two jobs, both cheap: bounce a request with no refresh token to the login
 * page, and, when the access token is spent or about to be, quietly swap the
 * refresh token for a new pair before the page renders. That is why a fifteen
 * minute access token is invisible to an administrator - nothing in a page has
 * to handle an expiry, because by the time the page runs the token is fresh.
 *
 * It runs on the Edge runtime, so it imports nothing from `next/headers` and
 * nothing from Node. The token is only decoded, never verified: the API checks
 * every signature, and a decision to show the shell or the login page is not an
 * authorisation decision.
 *
 * `/login` and `/api/*` are excluded. The login page must render without a
 * session, and the route handlers under `/api/session` are what mint one in the
 * first place - guarding them here would make login impossible.
 */
export const config = {
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.ico).*)'],
};

interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (refreshToken === undefined) {
    return toLogin(request);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (isFresh(accessToken, REFRESH_SKEW_SECONDS, nowSeconds)) {
    return NextResponse.next();
  }

  const refreshed = await refreshSession(refreshToken);
  if (refreshed === null) {
    const response = toLogin(request);
    clearSessionCookies(response);
    return response;
  }

  const response = NextResponse.next();
  writeSessionCookies(response, refreshed);
  return response;
}

/** POSTs the refresh token to the API, returning the rotated pair or null. */
async function refreshSession(refreshToken: string): Promise<TokenPair | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const data: unknown = await response.json();
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as Record<string, unknown>).access_token === 'string' &&
      typeof (data as Record<string, unknown>).refresh_token === 'string'
    ) {
      const record = data as { access_token: string; refresh_token: string };
      return { access_token: record.access_token, refresh_token: record.refresh_token };
    }
    return null;
  } catch {
    // A network failure is treated as "no session": the next request retries,
    // and an administrator who is genuinely signed in simply lands back on the
    // dashboard once the API answers again.
    return null;
  }
}

function toLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

function writeSessionCookies(response: NextResponse, pair: TokenPair): void {
  response.cookies.set(ACCESS_COOKIE, pair.access_token, cookieOptions(ACCESS_TTL_SECONDS, true));
  response.cookies.set(REFRESH_COOKIE, pair.refresh_token, cookieOptions(REFRESH_TTL_SECONDS, true));
}

function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, '', cookieOptions(0, true));
  response.cookies.set(REFRESH_COOKIE, '', cookieOptions(0, true));
}
