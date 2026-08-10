import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import {
  isStaffPresenceRole,
  normalizePresenceStatus,
  type PresenceStatus,
  type StaffPresenceEntry,
} from '../lib/presence';
import { readStoredUser, writeStoredUser } from '../lib/userStorage';

type PresenceContextValue = {
  myStatus: PresenceStatus;
  updating: boolean;
  setMyStatus: (status: PresenceStatus) => Promise<void>;
  getStatus: (userId: string) => PresenceStatus;
  staff: StaffPresenceEntry[];
  refresh: () => Promise<void>;
};

const PresenceContext = createContext<PresenceContextValue | undefined>(undefined);

const POLL_MS = 15_000;

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [staff, setStaff] = useState<StaffPresenceEntry[]>([]);
  const [updating, setUpdating] = useState(false);

  const myStatus = normalizePresenceStatus(user?.presenceStatus);

  const refresh = useCallback(async () => {
    if (!user?.firmId || user.role === 'Client') return;
    try {
      const { data } = await api.get<StaffPresenceEntry[]>('/presence');
      setStaff(
        data.map((s) => ({
          ...s,
          presenceStatus: normalizePresenceStatus(s.presenceStatus),
        }))
      );
    } catch {
      /* silent */
    }
  }, [user?.firmId, user?.role]);

  useEffect(() => {
    if (loading || !user?.id) return;
    if (!user.firmId || user.role === 'Client') {
      setStaff([]);
      return;
    }
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [loading, user?.id, user?.firmId, user?.role, refresh]);

  const setMyStatus = useCallback(
    async (status: PresenceStatus) => {
      if (!user?.id || !isStaffPresenceRole(user.role)) return;
      setUpdating(true);
      try {
        await api.patch('/presence/me', { status });
        setStaff((prev) =>
          prev.map((s) =>
            s.id === user.id
              ? { ...s, presenceStatus: status, presenceUpdatedAt: new Date().toISOString() }
              : s
          )
        );
        const parsed = readStoredUser();
        if (parsed) {
          writeStoredUser({ ...parsed, presenceStatus: status });
        }
        window.dispatchEvent(
          new CustomEvent('auditiq:presence-updated', { detail: { status } })
        );
      } finally {
        setUpdating(false);
      }
    },
    [user?.id, user?.role]
  );

  useEffect(() => {
    const onPresence = (e: Event) => {
      const status = (e as CustomEvent<{ status: PresenceStatus }>).detail?.status;
      if (status) refresh();
    };
    window.addEventListener('auditiq:presence-updated', onPresence);
    return () => window.removeEventListener('auditiq:presence-updated', onPresence);
  }, [refresh]);

  const getStatus = useCallback(
    (userId: string) => {
      if (userId === user?.id) return myStatus;
      const entry = staff.find((s) => s.id === userId);
      return normalizePresenceStatus(entry?.presenceStatus);
    },
    [staff, user?.id, myStatus]
  );

  const value = useMemo(
    () => ({
      myStatus,
      updating,
      setMyStatus,
      getStatus,
      staff,
      refresh,
    }),
    [myStatus, updating, setMyStatus, getStatus, staff, refresh]
  );

  return (
    <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error('usePresence must be used within PresenceProvider');
  return ctx;
}

export function usePresenceOptional() {
  return useContext(PresenceContext);
}
