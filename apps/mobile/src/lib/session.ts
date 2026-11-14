import * as SecureStore from 'expo-secure-store';
import type { TokenPair } from '@matrimony/shared';

/**
 * Durable session storage.
 *
 * The access token is what every authenticated call carries, and the refresh
 * token is the long-lived credential that mints new ones, so both are secrets
 * and belong in the platform keystore rather than `AsyncStorage` (which is
 * plaintext and reachable from a backup). Expo's `SecureStore` is a thin
 * wrapper over Keychain on iOS and EncryptedSharedPreferences on Android.
 *
 * On web there is no keystore — `SecureStore` reports unavailable. The exported
 * app is served as the website, so a browser session is stored in
 * `localStorage` instead: without it every reload signed the member out, which
 * is exactly what a website is not allowed to do. `localStorage` is readable by
 * any script on the origin, so this is weaker than the keystore, and the app says
 * so — the phone is the better place to stay signed in.
 */

const SESSION_KEY = 'networth-matrimony.session';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  tokenType: TokenPair['token_type'];
  /** Access-token lifetime in seconds, as reported by the server. */
  expiresIn: number;
  /**
   * Epoch milliseconds when this pair was issued.
   *
   * `expiresIn` alone cannot answer "is this still valid", and the token is
   * restored from storage days later, so the issued-at time has to be stored
   * with it. Optional because sessions written by earlier builds do not carry
   * it: absent means "unknown", which is treated as expired, and the refresh
   * token then mints a usable pair on the next launch.
   */
  obtainedAt?: number;
}

/** Refresh this long before the access token expires, not at the wire edge. */
export const REFRESH_LEAD_MS = 60_000;

/**
 * When the access token in `session` stops working, in epoch milliseconds.
 *
 * A session with no `obtainedAt` reports 0 — in the past — so a restored legacy
 * session refreshes before its first authenticated call instead of waiting for a
 * 401.
 */
export function sessionExpiresAt(session: StoredSession): number {
  return (session.obtainedAt ?? 0) + session.expiresIn * 1000;
}

let memoryFallback: StoredSession | null = null;

/** The slice of `Storage` this module uses, so it does not need the DOM lib. */
interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * `localStorage` on web, or null everywhere else.
 *
 * The storage object itself is the test: the native runtime has no
 * `localStorage`, and this module is unit tested without a React Native
 * transform, so it cannot ask `Platform.OS`.
 */
function webStorage(): WebStorage | null {
  try {
    const store = (globalThis as { localStorage?: WebStorage }).localStorage;
    return store ?? null;
  } catch {
    // Private-mode Safari and a site with storage disabled both throw on access.
    return null;
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    candidate.tokenType === 'Bearer' &&
    typeof candidate.expiresIn === 'number' &&
    (candidate.obtainedAt === undefined ||
      (typeof candidate.obtainedAt === 'number' && Number.isFinite(candidate.obtainedAt)))
  );
}

/** Converts the wire `TokenPair` (snake_case) into the stored shape. */
export function toStoredSession(tokens: TokenPair, now: number = Date.now()): StoredSession {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenType: tokens.token_type,
    expiresIn: tokens.expires_in,
    obtainedAt: now,
  };
}

export async function loadSession(): Promise<StoredSession | null> {
  const store = webStorage();
  if (store !== null) {
    try {
      const raw = store.getItem(SESSION_KEY);
      if (raw === null) return memoryFallback;
      const parsed: unknown = JSON.parse(raw);
      return isStoredSession(parsed) ? parsed : null;
    } catch {
      return memoryFallback;
    }
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) {
      return memoryFallback;
    }
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    // A corrupt or unreadable entry is indistinguishable from "no session" to
    // the caller, and throwing here would leave the app stuck on its loading
    // state forever. Treat it as signed out and move on.
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  memoryFallback = session;
  const store = webStorage();
  if (store !== null) {
    try {
      store.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Quota or a blocked write: the in-memory fallback still carries this run.
    }
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // The in-memory fallback above still carries the session for this run, so a
    // keystore write failure must not abort the sign-in the user just completed.
  }
}

export async function clearSession(): Promise<void> {
  memoryFallback = null;
  const store = webStorage();
  if (store !== null) {
    try {
      store.removeItem(SESSION_KEY);
    } catch {
      // Nothing useful to do: the fallback is already cleared.
    }
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  } catch {
    // Nothing useful to do: the fallback is already cleared.
  }
}
