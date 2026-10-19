import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CurrentUser, TokenPair } from '@matrimony/shared';
import { apiClient } from './api-client';
import { registerPushDevice, unregisterPushDevice } from './push';
import {
  clearSession,
  loadSession,
  saveSession,
  toStoredSession,
  type StoredSession,
} from './session';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  session: StoredSession | null;
  user: CurrentUser | null;
}

interface AuthContextValue {
  status: AuthStatus;
  /** The bearer token for authenticated calls; null when signed out. */
  token: string | null;
  /** The signed-in account, or null before the first fetch resolves. */
  user: CurrentUser | null;
  /** Persists a session and switches the app to signed in. */
  signIn: (tokens: TokenPair, user?: CurrentUser) => Promise<void>;
  /** Revokes the server session and clears local storage. */
  signOut: () => Promise<void>;
  /** Re-reads `GET /auth/me`; best-effort, never throws. */
  refreshUser: () => Promise<void>;
  /** Persists freshly minted tokens after a refresh. */
  updateSession: (tokens: TokenPair) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Owns the session for the whole app.
 *
 * Two things drive the shape here:
 *
 *   1. The session is restored from secure storage on launch, so a returning
 *      user is not dropped back to the OTP screen on every cold start. Until
 *      that read finishes the status is `loading`, which is what lets a guard
 *      avoid flashing the sign-in screen at an already-signed-in user.
 *   2. Push registration is keyed on the access token. Registering the device
 *      once a session exists and unregistering it when the session ends keeps
 *      the token table from accumulating tokens for signed-out devices, which
 *      would be a place to send notifications to someone who can no longer read
 *      them.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
    user: null,
  });

  /** Mirror of the live session for callbacks that must not re-subscribe. */
  const sessionRef = useRef<StoredSession | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const deviceTokenRef = useRef<string | null>(null);

  const refreshUser = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      const user = await apiClient.me(session.accessToken);
      // Guard against a sign-out that landed while the request was in flight.
      if (sessionRef.current !== session) return;
      setState((prev) => ({ ...prev, user }));
    } catch {
      // Best-effort: a stale token is handled by the next authenticated call,
      // and failing here would block sign-in for a network blip.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await loadSession();
      if (cancelled) return;
      if (!session) {
        setState({ status: 'signedOut', session: null, user: null });
        return;
      }
      sessionRef.current = session;
      setState({ status: 'signedIn', session, user: null });
      await refreshUser();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const signIn = useCallback(
    async (tokens: TokenPair, user?: CurrentUser) => {
      const session = toStoredSession(tokens);
      sessionRef.current = session;
      await saveSession(session);
      setState({ status: 'signedIn', session, user: user ?? null });
      if (!user) {
        await refreshUser();
      }
    },
    [refreshUser],
  );

  const updateSession = useCallback(async (tokens: TokenPair) => {
    const session = toStoredSession(tokens);
    sessionRef.current = session;
    await saveSession(session);
    setState((prev) => ({ ...prev, session }));
  }, []);

  const signOut = useCallback(async () => {
    const session = sessionRef.current;
    if (session) {
      try {
        await apiClient.logout({ refresh_token: session.refreshToken });
      } catch {
        // A network failure must not trap the user in a session they asked to
        // leave; local credentials are cleared below regardless.
      }
    }
    sessionRef.current = null;
    await clearSession();
    setState({ status: 'signedOut', session: null, user: null });
  }, []);

  const accessToken = state.session?.accessToken ?? null;

  useEffect(() => {
    if (accessToken) {
      accessTokenRef.current = accessToken;
      void registerPushDevice(accessToken).then((deviceToken) => {
        deviceTokenRef.current = deviceToken;
      });
      return;
    }

    const previous = accessTokenRef.current;
    const deviceToken = deviceTokenRef.current;
    accessTokenRef.current = null;
    deviceTokenRef.current = null;
    if (previous && deviceToken) {
      void unregisterPushDevice(previous, deviceToken);
    }
  }, [accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      token: accessToken,
      user: state.user,
      signIn,
      signOut,
      refreshUser,
      updateSession,
    }),
    [state.status, state.user, accessToken, signIn, signOut, refreshUser, updateSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
