import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AuthUser, getToken, setToken } from '@syncpost/api-client';
import { api } from '../lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  // Returns a Stripe Checkout URL when the chosen plan requires payment — the
  // caller should redirect there instead of navigating into the app.
  signup: (email: string, password: string, name: string, planId: string) => Promise<string | undefined>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', { email, password });
    setToken(res.accessToken);
    setUser(res.user);
  }

  async function signup(email: string, password: string, name: string, planId: string) {
    const res = await api.post<{ accessToken: string; user: AuthUser; checkoutUrl?: string }>('/auth/signup', {
      email,
      password,
      name,
      planId,
    });
    setToken(res.accessToken);
    setUser(res.user);
    return res.checkoutUrl;
  }

  async function loginWithToken(token: string) {
    setToken(token);
    const me = await api.get<AuthUser>('/auth/me');
    setUser(me);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
