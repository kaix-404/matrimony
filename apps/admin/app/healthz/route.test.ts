import { GET } from './route';

/**
 * The console's health check.
 *
 * `/login` was the health path and could not fail: it renders a form and touches
 * nothing. These tests pin down what replaced it — a 200 only when the API
 * answers its own liveness payload, and specifically not when the API is
 * unreachable, unhealthy, slow, or when the configured URL lands somewhere that
 * answers 200 to everything.
 */

jest.mock('@/lib/env', () => ({ API_BASE_URL: 'https://api.example.test/api/v1' }));

function upstream(status: number, body: unknown, contentType = 'application/json'): void {
  global.fetch = jest.fn(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': contentType },
      }),
  ) as unknown as typeof fetch;
}

describe('GET /healthz', () => {
  let logged: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('is ok when the API answers its liveness probe', async () => {
    upstream(200, { status: 'ok' });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok', ok: true, api: 'ok' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/health/live',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('fails when the API cannot be reached', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: 'unavailable',
      ok: false,
      api: 'unreachable',
    });
    expect(logged).toHaveBeenCalled();
  });

  it('fails when the API times out', async () => {
    // Render gives a health check five seconds; the probe must give up before
    // that and say so rather than hang the check.
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    global.fetch = jest.fn(async () => {
      throw timeout;
    }) as unknown as typeof fetch;

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ api: 'timeout' });
  });

  it('fails when the API answers but is not healthy', async () => {
    upstream(503, { status: 'degraded' });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      api: 'unhealthy',
      upstream_status: 503,
    });
  });

  it('fails on a 200 that is not this API', async () => {
    // The misconfigured-URL case: the host answers 200 to everything, so status
    // alone would call the console healthy.
    upstream(200, '<!DOCTYPE html><html><body>Not the API</body></html>', 'text/html');

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      api: 'unexpected',
      upstream_status: 200,
    });
  });
});
