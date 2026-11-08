import { NextResponse } from 'next/server';
import { AdminMfaVerifySchema, AdminTokenPairSchema } from '@matrimony/shared';
import { API_BASE_URL } from '@/lib/env';
import { describeUpstreamFailure, extractMessage } from '@/lib/errors';
import { writeSessionCookies } from '@/lib/cookies';

/**
 * Completes an MFA login: the challenge token from `/login` plus a current code.
 *
 * The email travels alongside the code only so the header can greet the
 * administrator; it is never forwarded to the API, which validates the pair
 * `{ challenge_token, code }` on its own and returns tokens alone. If the email
 * is absent the display cookie simply falls back to a generic label.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    // A submitted form carries no challenge token: that lives in component state
    // for a few minutes, so a browser that never hydrated cannot be at this step.
    // Saying so beats accepting a code nothing will verify.
    return new NextResponse(null, {
      status: 303,
      headers: { location: '/login?problem=mfa' },
    });
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = AdminMfaVerifySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Enter the six-digit code from your authenticator app.' },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/admin/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
  } catch (caught) {
    console.error('[admin-session] MFA verify could not reach the API', caught);
    return NextResponse.json({ message: describeUpstreamFailure(caught) }, { status: 502 });
  }
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      { message: extractMessage(body) ?? 'That code was not accepted.' },
      { status: response.status },
    );
  }

  const pair = AdminTokenPairSchema.safeParse(body);
  if (!pair.success) {
    return NextResponse.json(
      { message: 'The server returned an unexpected sign-in response.' },
      { status: 502 },
    );
  }

  const maybeEmail = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).email : undefined;
  const email = typeof maybeEmail === 'string' && maybeEmail.length > 0 ? maybeEmail : 'administrator';

  await writeSessionCookies(pair.data, email);
  return NextResponse.json({ ok: true });
}
