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
import { AppState } from 'react-native';
import type { CurrentUser, TokenPair } from '@matrimony/shared';
import { apiClient, setUnauthorizedHandler } from './api-client';
import { ApiError } from './api-errors';
import { registerPushDevice, unregisterPushDevice } from './push';
import {
  REFRESH_LEAD_MS,
  clearSession,
  loadSession,
  saveSession,
  sessionExpiresAt,
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
      // Any other change is a token refresh, which the retry in the transport
      // already handled — comparing whole sessions would discard that result.
      if (sessionRef.current === null) return;
      setState((prev) => ({ ...prev, user }));
    } catch {
      // Best-effort: a stale token is handled by the next authenticated call,
      // and failing here would block sign-in for a network blip.
    }
  }, []);

  /** Writes a freshly minted pair to storage and to state. */
  const persistSession = useCallback(async (tokens: TokenPair) => {
    const session = toStoredSession(tokens);
    sessionRef.current = session;
    await saveSession(session);
    setState((prev) => ({ ...prev, session }));
  }, []);

  /** Drops the session locally, without asking the server to revoke it. */
  const endSession = useCallback(async () => {
    sessionRef.current = null;
    await clearSession();
    setState({ status: 'signedOut', session: null, user: null });
  }, []);

  /** Guards against two refreshes racing on the same refresh token. */
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  /**
   * Mints a new access token from the stored refresh token.
   *
   * The access token lives 15 minutes (`JWT_ACCESS_TTL`) while the refresh token
   * lives 30 days, so this is what makes a member's session last: without it the
   * app was signed out every quarter of an hour, which is what "I have to log in
   * again" turned out to be.
   *
   * Single-flight, because every refresh rotates and revokes its predecessor:
   * two concurrent refreshes with the same token would spend it twice, and the
   * loser would look like a revoked session. Returns the new access token, or
   * null when it could not be minted.
   */
  const refreshTokens = useCallback(async (): Promise<string | null> => {
    const inFlight = refreshInFlight.current;
    if (inFlight !== null) return inFlight;

    const session = sessionRef.current;
    if (!session) return null;

    const task = (async (): Promise<string | null> => {
      try {
        const tokens = await apiClient.refresh({ refresh_token: session.refreshToken });
        // A sign-out that landed mid-flight owns the state now.
        if (sessionRef.current !== session) return null;
        await persistSession(tokens);
        return tokens.access_token;
      } catch (error) {
        // Only a refusal ends the session. A network failure or a 5xx is not a
        // revoked credential, and signing out on one would log a member out on
        // a flaky connection — the next call simply tries again.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await endSession();
        }
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();

    refreshInFlight.current = task;
    return task;
  }, [persistSession, endSession]);

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
      // A session restored after more than fifteen minutes is carrying a dead
      // access token. Refresh first so the first screen does not open on a 401.
      if (sessionExpiresAt(session) - Date.now() <= REFRESH_LEAD_MS) {
        await refreshTokens();
        // Only a refused refresh token ends the session. A network failure
        // leaves it in place, and reading the member's account can wait for the
        // next attempt rather than blocking the launch.
        if (sessionRef.current === null) return;
      }
      await refreshUser();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser, refreshTokens]);

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
    await endSession();
  }, [endSession]);

  /**
   * Refreshes ahead of expiry, so a member mid-session never meets a 401.
   *
   * One timer per issued token: `state.session` changes on every refresh, which
   * cancels the previous timer and schedules the next. A timer that would run
   * past the platform's maximum delay is clamped, or it fires immediately.
   */
  useEffect(() => {
    if (state.status !== 'signedIn' || state.session === null) return;
    const delay = sessionExpiresAt(state.session) - Date.now() - REFRESH_LEAD_MS;
    const timer = setTimeout(
      () => {
        void refreshTokens();
      },
      Math.min(Math.max(delay, 0), 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [state.status, state.session, refreshTokens]);

  /**
   * Refreshes on return from the background.
   *
   * Timers do not run while the app is suspended, so a session that was fresh
   * when the member switched away can be hours stale when they come back. This
   * runs before the visible screen's own fetches settle on a 401.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const session = sessionRef.current;
      if (session !== null && sessionExpiresAt(session) - Date.now() <= REFRESH_LEAD_MS) {
        void refreshTokens();
      }
    });
    return () => subscription.remove();
  }, [refreshTokens]);

  // The transport retries a refused bearer through this. It answers with the
  // stored token when the refusal is stale (another request already refreshed),
  // so a page of parallel calls produces one refresh, not one per call.
  useEffect(() => {
    setUnauthorizedHandler(async (refused) => {
      const session = sessionRef.current;
      if (session === null) return null;
      if (session.accessToken !== refused) return session.accessToken;
      return refreshTokens();
    });
    return () => setUnauthorizedHandler(null);
  }, [refreshTokens]);

  const accessToken = state.session?.accessToken ?? null;

  /**
   * Push registration is keyed on the session, not on the access token: the
   * token is replaced every fifteen minutes, and keying on it would re-register
   * the device on each refresh for no reason.
   */
  useEffect(() => {
    if (state.status === 'signedIn') {
      const token = sessionRef.current?.accessToken;
      if (!token) return;
      accessTokenRef.current = token;
      void registerPushDevice(token).then((deviceToken) => {
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
  }, [state.status]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      token: accessToken,
      user: state.user,
      signIn,
      signOut,
      refreshUser,
    }),
    [state.status, state.user, accessToken, signIn, signOut, refreshUser],
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
