import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AuthUser, getToken, setToken } from '@syncpost/api-client';
import { api } from '../lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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
      .then((u) => {
        if (u.role !== 'ADMIN') {
          setToken(null);
          setUser(null);
        } else {
          setUser(u);
        }
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', { email, password });
    if (res.user.role !== 'ADMIN') {
      throw new Error('This account is not an admin account.');
    }
    setToken(res.accessToken);
    setUser(res.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
