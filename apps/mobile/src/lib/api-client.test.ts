// The API base URL comes from app config, which reads native `expo-constants`;
// the transport under test only needs the resolved string.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock('./config', () => ({ config: { apiBaseUrl: 'https://api.test/api/v1' } }));

import { API_UNAVAILABLE_CODE, ApiError } from './api-errors';
import { apiClient, setUnauthorizedHandler } from './api-client';

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

const unauthorized = () => response(401, { message: 'Access token has expired', code: 'UNAUTHENTICATED' });

function lastAuthorization(): string | null {
  const calls = fetchMock.mock.calls;
  const init = calls[calls.length - 1]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers).get('Authorization');
}

/**
 * Redeeming a refused access token.
 *
 * The access token lives fifteen minutes; a member browsing profiles crosses
 * that line mid-session. Before this, the refusal reached the screen as a failed
 * action and the member was signed out — so what matters here is that a refused
 * call is retried with a minted token, exactly once, and that a genuinely ended
 * session is not retried forever.
 */
let fetchMock: jest.Mock;

describe('refused bearer tokens', () => {
  beforeEach(() => {
    fetchMock = jest.fn();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    jest.restoreAllMocks();
  });

  it('retries once with the refreshed token', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(response(200, { mobile: '9876543210' }));

    const handler = jest.fn(async () => 'fresh-token');
    setUnauthorizedHandler(handler);

    const user = await apiClient.me('stale-token');

    expect(user).toEqual({ mobile: '9876543210' });
    expect(handler).toHaveBeenCalledWith('stale-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastAuthorization()).toBe('Bearer fresh-token');
  });

  it('fails with the API error when the session really is over', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    setUnauthorizedHandler(async () => null);

    await expect(apiClient.me('stale-token')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not loop when the retried call is refused again', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());

    const handler = jest.fn(async () => 'fresh-token');
    setUnauthorizedHandler(handler);

    await expect(apiClient.me('stale-token')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('leaves anonymous calls alone', async () => {
    fetchMock.mockResolvedValueOnce(response(200, []));
    const handler = jest.fn(async () => 'fresh-token');
    setUnauthorizedHandler(handler);

    await apiClient.getNetWorthCategories();

    expect(handler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * Coping with a cold free-tier API.
 *
 * Fifteen minutes of no traffic spins the API down, and the first request after
 * that used to fail: the proxy met a pooled socket the sleeping instance's edge
 * had already closed, answered 502, and the member was shown the raw markup of
 * an error page. What matters here is that an idempotent call waits and tries
 * again, that a POST is not replayed, and that what finally reaches a member is
 * a sentence.
 */
describe('a cold API', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const unreachable = () =>
    response(502, {
      statusCode: 502,
      code: API_UNAVAILABLE_CODE,
      message: 'The API is unreachable right now.',
    });

  it('waits and retries a read while the instance boots', async () => {
    fetchMock
      .mockResolvedValueOnce(unreachable())
      .mockResolvedValueOnce(response(200, { mobile: '9876543210' }));

    const request = apiClient.me('token');
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(request).resolves.toEqual({ mobile: '9876543210' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a connection the sleeping edge dropped', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response(200, { mobile: '9876543210' }));

    const request = apiClient.me('token');
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(request).resolves.toEqual({ mobile: '9876543210' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up with a sentence rather than an error page', async () => {
    // What the edge sends: an HTML page with no JSON and no code.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => '<!DOCTYPE html><html><head><title>502</title></head></html>',
      json: async () => ({}),
    } as unknown as Response);

    const settled = apiClient.me('token').catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);
    const error = await settled;

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).code).toBe(API_UNAVAILABLE_CODE);
    expect((error as ApiError).message).not.toContain('<');
    // Five attempts: the first four wait, the fifth gives up.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('does not replay a POST, which could arrive twice', async () => {
    fetchMock.mockResolvedValueOnce(unreachable());

    await expect(apiClient.submitProfileForReview('token')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the API's own coded refusals verbatim", async () => {
    fetchMock.mockResolvedValueOnce(
      response(503, { statusCode: 503, code: 'SMS_UNAVAILABLE', message: 'No SMS provider' }),
    );

    const settled = apiClient.me('token').catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);

    expect((await settled) as ApiError).toMatchObject({
      status: 503,
      code: 'SMS_UNAVAILABLE',
      message: 'No SMS provider',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
