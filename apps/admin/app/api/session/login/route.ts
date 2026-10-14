import { NextResponse } from 'next/server';
import { AdminLoginSchema, AdminMfaChallengeSchema, AdminTokenPairSchema } from '@matrimony/shared';
import { API_BASE_URL } from '@/lib/env';
import { extractMessage } from '@/lib/errors';
import { writeSessionCookies } from '@/lib/cookies';

/**
 * Signs an administrator in.
 *
 * This is the browser-facing half of `POST /admin/auth/login`. It validates the
 * body against the same Zod schema the API uses, then decides what the API's
 * answer means: a challenge when MFA is enrolled, or a session that it seals
 * into httpOnly cookies. The token is never returned to the browser.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = AdminLoginSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Enter a valid email address and a password of at least 8 characters.' },
      { status: 400 },
    );
  }

  const response = await fetch(`${API_BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // A wrong password and an unknown email are reported identically, so the
    // dashboard cannot be used to discover which administrator addresses exist.
    return NextResponse.json(
      { message: extractMessage(body) ?? 'Email or password is incorrect.' },
      { status: response.status },
    );
  }

  const challenge = AdminMfaChallengeSchema.safeParse(body);
  if (challenge.success) {
    return NextResponse.json({ mfa_required: true, challenge_token: challenge.data.challenge_token });
  }

  const pair = AdminTokenPairSchema.safeParse(body);
  if (!pair.success) {
    return NextResponse.json(
      { message: 'The server returned an unexpected sign-in response.' },
      { status: 502 },
    );
  }

  await writeSessionCookies(pair.data, parsed.data.email);
  return NextResponse.json({ ok: true });
}
