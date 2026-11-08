import { cookies } from 'next/headers';
import { adminFetch } from './api';
import { ApiError } from './errors';

/**
 * `adminFetch` is the door every dashboard screen goes through, so the parts
 * worth pinning down are the ones a screen cannot see: the bearer header it
 * attaches on the operator's behalf, the fact that it never lets a response be
 * cached, and the way an API failure arrives as an `ApiError` with its status
 * intact.
 */
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const mockedCookies = cookies as jest.MockedFunction<typeof cookies>;

function respond(status: number, body: string): void {
  const fetchMock = fetch as unknown as jest.Mock;
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

function lastCall(): { url: string; init: RequestInit } {
  const fetchMock = fetch as unknown as jest.Mock;
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch;
  mockedCookies.mockResolvedValue({
    get: (name: string) => (name === 'mny_admin_at' ? { value: 'token_from_cookie' } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
});

describe('adminFetch', () => {
  it('attaches the session cookie as a bearer token and never caches', async () => {
    respond(200, '{"ok":true}');

    await adminFetch('/admin/reports');

    const { url, init } = lastCall();
    expect(url).toBe('http://localhost:4000/api/v1/admin/reports');
    expect(init.headers).toMatchObject({ authorization: 'Bearer token_from_cookie' });
    expect(init.cache).toBe('no-store');
  });

  it('omits the header when there is no session, leaving the API to refuse it', async () => {
    mockedCookies.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    respond(401, '{"message":"Unauthorized"}');

    await expect(adminFetch('/admin/reports')).rejects.toBeInstanceOf(ApiError);

    const { init } = lastCall();
    expect(init.headers).not.toHaveProperty('authorization');
  });

  it('prefers a token handed in directly, which is how the login route uses it', async () => {
    respond(200, '{}');

    await adminFetch('/admin/me', { token: 'fresh_token' });

    expect(lastCall().init.headers).toMatchObject({ authorization: 'Bearer fresh_token' });
  });

  it('sends a JSON body only when one was given', async () => {
    respond(200, '{}');
    await adminFetch('/admin/pricing', { method: 'POST', body: { category: 'BELOW_1CR' } });

    const posted = lastCall();
    expect(posted.init.method).toBe('POST');
    expect(posted.init.body).toBe('{"category":"BELOW_1CR"}');

    respond(200, '{}');
    await adminFetch('/admin/reports');
    expect(lastCall().init.method).toBe('GET');
    expect(lastCall().init.body).toBeUndefined();
  });

  it('parses a JSON answer', async () => {
    respond(200, '{"users":[],"hasMore":false}');

    await expect(adminFetch('/admin/users')).resolves.toEqual({ users: [], hasMore: false });
  });

  it('passes a non-JSON answer through rather than throwing on it', async () => {
    respond(200, 'upstream said no');

    await expect(adminFetch('/admin/users')).resolves.toBe('upstream said no');
  });

  it('survives an empty body', async () => {
    respond(204, '');

    await expect(adminFetch('/admin/unlocks', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('reports the API message and keeps the status', async () => {
    respond(403, '{"message":"Missing permission: pricing:write"}');

    await expect(adminFetch('/admin/pricing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Missing permission: pricing:write',
    });
  });

  it('falls back to the status when the error body says nothing useful', async () => {
    respond(500, '');

    await expect(adminFetch('/admin/reports')).rejects.toMatchObject({
      status: 500,
      message: 'Request failed (500)',
    });
  });
});
