import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

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
