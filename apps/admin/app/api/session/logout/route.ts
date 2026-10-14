import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { API_BASE_URL } from '@/lib/env';
import { deleteSessionCookies } from '@/lib/cookies';
import { REFRESH_COOKIE } from '@/lib/session';

/**
 * Signs the administrator out.
 *
 * The refresh token is revoked at the API first, so a copy of it cannot be
 * replayed; only then are the local cookies cleared. If the API is unreachable
 * the cookies are still cleared - a sign-out that leaves a live session behind
 * because the network was down would be the worse failure.
 */
export async function POST(): Promise<NextResponse> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (refreshToken !== undefined) {
    await fetch(`${API_BASE_URL}/admin/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }

  await deleteSessionCookies();
  return NextResponse.json({ ok: true });
}
