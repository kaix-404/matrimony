import { NextResponse } from 'next/server';
import { AdminLoginSchema, AdminMfaChallengeSchema, AdminTokenPairSchema } from '@matrimony/shared';
import { API_BASE_URL } from '@/lib/env';
import { describeUpstreamFailure, extractMessage } from '@/lib/errors';
import { writeSessionCookies } from '@/lib/cookies';

/**
 * Signs an administrator in.
 *
 * This is the browser-facing half of `POST /admin/auth/login`. It validates the
 * body against the same Zod schema the API uses, then decides what the API's
 * answer means: a challenge when MFA is enrolled, or a session that it seals
 * into httpOnly cookies. The token is never returned to the browser.
 */
/**
 * The credentials from either a JSON body or a submitted HTML form.
 *
 * The form path exists for the case the browser never hydrates: a form with no
 * method is a GET, which would put the administrator's password into the URL,
 * the history and every access log between here and the browser. So the form
 * posts here instead, and a form post is answered with a redirect rather than
 * JSON - there is no script to read a body.
 */
async function readCredentials(
  request: Request,
): Promise<{ raw: unknown; formPost: boolean }> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const data = await request.formData().catch(() => null);
    return {
      raw: data === null ? null : { email: data.get('email'), password: data.get('password') },
      formPost: true,
    };
  }
  return { raw: await request.json().catch(() => null), formPost: false };
}

/**
 * Redirects with a relative Location, so the destination never depends on a
 * Host header somebody else controls.
 */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

/** Sends a form post back to the sign-in page, with the reason and no credentials. */
function backToLogin(
  problem: 'invalid' | 'rejected' | 'unreachable' | 'mfa' | 'unexpected',
): NextResponse {
  return seeOther(`/login?problem=${problem}`);
}

export async function POST(request: Request): Promise<NextResponse> {
  const { raw, formPost } = await readCredentials(request);
  const parsed = AdminLoginSchema.safeParse(raw);
  if (!parsed.success) {
    if (formPost) {
      return backToLogin('invalid');
    }
    return NextResponse.json(
      { message: 'Enter a valid email address and a password of at least 8 characters.' },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
  } catch (caught) {
    // Distinguished from a 4xx below: nothing was said about the credentials, so
    // reporting "Email or password is incorrect" here would be a lie.
    console.error('[admin-session] login could not reach the API', caught);
    if (formPost) {
      return backToLogin('unreachable');
    }
    return NextResponse.json({ message: describeUpstreamFailure(caught) }, { status: 502 });
  }
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // A wrong password and an unknown email are reported identically, so the
    // dashboard cannot be used to discover which administrator addresses exist.
    if (formPost) {
      return backToLogin('rejected');
    }
    return NextResponse.json(
      { message: extractMessage(body) ?? 'Email or password is incorrect.' },
      { status: response.status },
    );
  }

  const challenge = AdminMfaChallengeSchema.safeParse(body);
  if (challenge.success) {
    if (formPost) {
      // The challenge token is held in component state for a few minutes; a
      // browser that never hydrated cannot hold it, so it is not smuggled into a
      // cookie just to finish a second step that needs JavaScript anyway.
      return backToLogin('mfa');
    }
    return NextResponse.json({ mfa_required: true, challenge_token: challenge.data.challenge_token });
  }

  const pair = AdminTokenPairSchema.safeParse(body);
  if (!pair.success) {
    if (formPost) {
      return backToLogin('unexpected');
    }
    return NextResponse.json(
      { message: 'The server returned an unexpected sign-in response.' },
      { status: 502 },
    );
  }

  await writeSessionCookies(pair.data, parsed.data.email);
  if (formPost) {
    return seeOther('/');
  }
  return NextResponse.json({ ok: true });
}
