import { POST } from './route';

/**
 * The console's sign-in route — the hop that decides what an operator is told.
 *
 * The bug these tests exist for: the API answered 500, the route relayed that
 * 500, and the browser showed the *console's* own failure with the API's
 * "Internal server error" attached to neither side. A local sign-in was then
 * misdiagnosed as a cookie-write bug and debugged in the wrong service. The
 * contract now is narrow and worth pinning down:
 *
 * - an upstream 5xx is 502 Bad Gateway, and the message names the status and the
 *   detail, so the next reader looks at the API;
 * - a credential answer (401/403/400) passes through untouched, because relaying
 *   "the gateway failed" for a wrong password would send somebody hunting an
 *   outage that does not exist;
 * - the form path, which exists for browsers that never hydrated, has no script
 *   to read a body, so every failure becomes a `?problem=` code on `/login`.
 */

jest.mock('@/lib/env', () => ({ API_BASE_URL: 'https://api.example.test/api/v1' }));
jest.mock('@/lib/cookies', () => ({ writeSessionCookies: jest.fn(async () => undefined) }));

const { writeSessionCookies } = jest.requireMock('@/lib/cookies') as {
  writeSessionCookies: jest.Mock;
};

const CREDENTIALS = { email: 'admin@example.com', password: 'a-long-password' };

function jsonRequest(): Request {
  return new Request('https://admin.example.test/api/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(CREDENTIALS),
  });
}

function formRequest(): Request {
  return new Request('https://admin.example.test/api/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(CREDENTIALS).toString(),
  });
}

function upstream(status: number, body: unknown): void {
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('POST /api/session/login', () => {
  let logged: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (writeSessionCookies as jest.Mock).mockClear();
  });

  afterEach(() => {
    logged.mockRestore();
    jest.restoreAllMocks();
  });

  describe('when the API itself fails', () => {
    it('answers 502 and names the upstream status and detail', async () => {
      upstream(500, { message: 'Internal server error' });

      const response = await POST(jsonRequest());

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        message:
          "The API failed to process the sign-in (500: Internal server error). Check the API's logs.",
      });
    });

    it('logs which API it called, so the failure points at a service', async () => {
      upstream(503, { message: 'Service Unavailable' });

      await POST(jsonRequest());

      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('https://api.example.test/api/v1'),
      );
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('503'));
    });

    it('still names a status when the API sends no message', async () => {
      global.fetch = jest.fn(
        async () => new Response('', { status: 500 }),
      ) as unknown as typeof fetch;

      const response = await POST(jsonRequest());

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        message: "The API failed to process the sign-in (500: HTTP 500). Check the API's logs.",
      });
    });

    it('sends a form post back to the sign-in page with problem=apifailed', async () => {
      upstream(500, { message: 'Internal server error' });

      const response = await POST(formRequest());

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/login?problem=apifailed');
      // Nothing was accepted, so nothing may be sealed into a session either.
      expect(writeSessionCookies).not.toHaveBeenCalled();
    });

    it('treats an unreachable API as a gateway failure, not bad credentials', async () => {
      global.fetch = jest.fn(async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch;

      const response = await POST(jsonRequest());

      expect(response.status).toBe(502);
      const body = (await response.json()) as { message: string };
      expect(body.message).not.toMatch(/incorrect/i);
    });
  });

  describe('when the answer is about the credentials', () => {
    it('relays the 401 unchanged', async () => {
      upstream(401, { message: 'Invalid credentials' });

      const response = await POST(jsonRequest());

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ message: 'Invalid credentials' });
    });

    it('sends a rejected form post back as problem=rejected', async () => {
      upstream(401, { message: 'Invalid credentials' });

      const response = await POST(formRequest());

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/login?problem=rejected');
    });
  });

  describe('when the API accepts the sign-in', () => {
    it('seals the token pair into cookies and tells the browser nothing more', async () => {
      const pair = {
        access_token: 'at_123',
        refresh_token: 'rt_456',
        token_type: 'Bearer' as const,
        expires_in: 900,
      };
      upstream(200, pair);

      const response = await POST(jsonRequest());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(writeSessionCookies).toHaveBeenCalledWith(pair, CREDENTIALS.email);
    });

    it('tells the console which factor is waiting', async () => {
      upstream(200, {
        mfa_required: true,
        method: 'sms',
        challenge_token: 'challenge_sms',
        expires_in: 300,
        phone_hint: '••••••3210',
      });

      const response = await POST(jsonRequest());

      // Without these two fields the console asks for "the code from your
      // authenticator app" to somebody waiting for a text message.
      await expect(response.json()).resolves.toEqual({
        mfa_required: true,
        method: 'sms',
        phone_hint: '••••••3210',
        challenge_token: 'challenge_sms',
      });
    });

    it('turns an MFA challenge into a redirect for a form post', async () => {
      upstream(200, { mfa_required: true, challenge_token: 'challenge_1', expires_in: 300 });

      const response = await POST(formRequest());

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/login?problem=mfa');
      expect(writeSessionCookies).not.toHaveBeenCalled();
    });
  });

  it('rejects a short password before calling the API at all', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    const response = await POST(
      new Request('https://admin.example.test/api/session/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: CREDENTIALS.email, password: 'short' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
