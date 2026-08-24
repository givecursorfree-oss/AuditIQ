import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import type { User } from '../types';
import { isStaffPresenceRole } from '@/lib/presence';
import { formatApiError, isApiNetworkFailure } from '@/lib/apiErrors';

export type LoginResult =
  | { kind: 'success'; user: User }
  | { kind: '2fa-required'; preAuthToken: string };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Set when /auth/me fails due to network/timeout (not 401). */
  sessionError: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (preAuthToken: string, code: string) => Promise<User>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    firmName?: string;
  }) => Promise<void>;
  /** Ends app session only — does not mark attendance check-out. */
  logout: () => Promise<void>;
  /** Refetch /auth/me — e.g. after role permissions change in Settings */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Restore session from httpOnly cookie via /auth/me
  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data);
        setSessionError(null);
      })
      .catch((err) => {
        setUser(null);
        setSessionError(isApiNetworkFailure(err) ? formatApiError(err, 'session') : null);
      })
      .finally(() => setLoading(false));
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const onPresence = (e: Event) => {
      const status = (e as CustomEvent<{ status: string }>).detail?.status;
      if (!status) return;
      setUser((prev) => (prev ? { ...prev, presenceStatus: status as User['presenceStatus'] } : prev));
    };
    window.addEventListener('auditiq:presence-updated', onPresence);
    return () => window.removeEventListener('auditiq:presence-updated', onPresence);
  }, []);

  useEffect(() => {
    const onPermissions = () => {
      void refreshUser();
    };
    window.addEventListener('auditiq:permissions-updated', onPermissions);
    return () => window.removeEventListener('auditiq:permissions-updated', onPermissions);
  }, [refreshUser]);

  const applyLoggedInUser = useCallback((userData: User & { presenceStatus?: string }) => {
    const loggedIn = {
      ...userData,
      presenceStatus: isStaffPresenceRole(userData.role) ? 'online' : userData.presenceStatus,
    } as User;
    setUser(loggedIn);
    return loggedIn;
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { data } = await api.post('/auth/login', { email, password });

    if (data.twoFactorRequired && data.preAuthToken) {
      return { kind: '2fa-required', preAuthToken: data.preAuthToken };
    }

    // Attendance is marked from Login page GPS / Attendance page — not here.
    return { kind: 'success', user: applyLoggedInUser(data.user) };
  }, [applyLoggedInUser]);

  const verifyTwoFactor = useCallback(async (preAuthToken: string, code: string) => {
    const { data } = await api.post('/auth/2fa/verify', { preAuthToken, code });
    return applyLoggedInUser(data.user);
  }, [applyLoggedInUser]);

  const register = useCallback(async (payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    firmName?: string;
  }) => {
    const { data } = await api.post('/auth/register', payload);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const uid = user?.id;
    const role = user?.role;

    if (uid && role && isStaffPresenceRole(role)) {
      try {
        await api.patch('/presence/me', { status: 'offline' });
      } catch {
        /* ignore */
      }
    }

    // Attendance check-out is manual on /attendance only — logout must not close the day
    // (staff log in/out of the app many times; presence ≠ attendance).

    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    setUser(null);
  }, [user?.id, user?.role]);

  const value = useMemo(
    () => ({ user, loading, sessionError, login, verifyTwoFactor, register, logout, refreshUser }),
    [user, loading, sessionError, login, verifyTwoFactor, register, logout, refreshUser]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
