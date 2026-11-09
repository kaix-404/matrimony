// The keystore is a native module; these assertions only need the pure helpers,
// so the store reports unavailable and the module's memory fallback is unused.
jest.mock('expo-secure-store', () => ({
  isAvailableAsync: async () => false,
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

import { REFRESH_LEAD_MS, sessionExpiresAt, toStoredSession } from './session';

const PAIR = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  token_type: 'Bearer' as const,
  expires_in: 900,
};

/**
 * When a stored session's access token dies.
 *
 * `expiresIn` is a duration, and a session is read back from the keystore hours
 * or days later, so the duration alone cannot say whether the token inside it
 * still works. Without the issued-at stamp a restored session looked fresh
 * forever, and every call from it was answered with a 401 — the member's view of
 * which was being signed out.
 */
describe('sessionExpiresAt', () => {
  it('counts the access token lifetime from when it was issued', () => {
    const issuedAt = 1_700_000_000_000;
    const session = toStoredSession(PAIR, issuedAt);
    expect(sessionExpiresAt(session)).toBe(issuedAt + 900_000);
  });

  it('treats a session saved before issued-at was recorded as already expired', () => {
    // The shape an older build wrote: no `obtainedAt`. Guessing "fresh" would
    // mean a minute of 401s on launch; treating it as expired costs one refresh.
    const legacy = {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer' as const,
      expiresIn: 900,
    };
    expect(sessionExpiresAt(legacy)).toBeLessThanOrEqual(Date.now());
  });

  it('refreshes before the token dies rather than at the wire edge', () => {
    expect(REFRESH_LEAD_MS).toBeGreaterThan(0);
    expect(REFRESH_LEAD_MS).toBeLessThan(900_000);
  });
});
