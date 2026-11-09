// The API base URL comes from app config, which reads native `expo-constants`;
// the transport under test only needs the resolved string.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock('./config', () => ({ config: { apiBaseUrl: 'https://api.test/api/v1' } }));

import { ApiError } from './api-errors';
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
