import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { registerPushDevice, unregisterPushDevice } from './push';

interface AuthState {
  token: string | null;
}

interface AuthContextValue {
  token: string | null;
  setToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null });

  const accessTokenRef = useRef<string | null>(null);
  const deviceTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.token) {
      accessTokenRef.current = state.token;
      void registerPushDevice(state.token).then((deviceToken) => {
        deviceTokenRef.current = deviceToken;
      });
      return;
    }

    const accessToken = accessTokenRef.current;
    const deviceToken = deviceTokenRef.current;
    accessTokenRef.current = null;
    deviceTokenRef.current = null;
    if (accessToken && deviceToken) {
      void unregisterPushDevice(accessToken, deviceToken);
    }
  }, [state.token]);

  const value = useMemo(
    () => ({
      token: state.token,
      setToken: (token: string | null) => setState({ token }),
    }),
    [state.token],
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
