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
 * On web there is no keystore — `SecureStore` reports unavailable — so a
 * module-level fallback keeps the session for the tab's lifetime. Web is a
 * development target here, not a shipping one, and silently doing nothing would
 * make the sign-in flow appear broken during local testing.
 */

const SESSION_KEY = 'networth-matrimony.session';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  tokenType: TokenPair['token_type'];
  /** Access-token lifetime in seconds, as reported by the server. */
  expiresIn: number;
}

let memoryFallback: StoredSession | null = null;

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    candidate.tokenType === 'Bearer' &&
    typeof candidate.expiresIn === 'number'
  );
}

/** Converts the wire `TokenPair` (snake_case) into the stored shape. */
export function toStoredSession(tokens: TokenPair): StoredSession {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenType: tokens.token_type,
    expiresIn: tokens.expires_in,
  };
}

export async function loadSession(): Promise<StoredSession | null> {
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
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  } catch {
    // Nothing useful to do: the fallback is already cleared.
  }
}
