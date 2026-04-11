import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    firmName?: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('auditiq_token');
    const savedUser = localStorage.getItem('auditiq_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('auditiq_token', data.token);
      localStorage.setItem('auditiq_user', JSON.stringify(data.user));
    } catch (error) {
      console.warn('Backend login failed. Using mock demo user for demo purposes.');
      // Mock fallback for demo
      const mockToken = 'mock_jwt_token_demo';
      const firstName = email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);
      const mockUser = {
        id: 'demo-usr-999',
        email,
        firstName,
        lastName: 'Partner',
        initials: firstName.charAt(0) + 'P',
        role: 'Partner',
        designation: 'Senior Partner',
        firmId: 'demo-firm-1',
        isActive: true,
      };
      setToken(mockToken);
      setUser((mockUser as unknown) as User);
      localStorage.setItem('auditiq_token', mockToken);
      localStorage.setItem('auditiq_user', JSON.stringify(mockUser));
    }
  }, []);

  const register = useCallback(async (payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    firmName?: string;
  }) => {
    const { data } = await api.post('/auth/register', payload);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('auditiq_token', data.token);
    localStorage.setItem('auditiq_user', JSON.stringify(data.user));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auditiq_token');
    localStorage.removeItem('auditiq_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
