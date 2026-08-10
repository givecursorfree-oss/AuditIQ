import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import {
  EMPTY_NAV_BADGES,
  badgeForNavId,
  CHROME_NOTIFICATIONS_BADGE_KEY,
  type NavBadges,
} from '../lib/navBadgeMap';
import { useNavAttentionOnRoute } from '../hooks/useNavAttentionOnRoute';

const POLL_MS = 30_000;

type NavBadgesContextValue = {
  badges: NavBadges;
  loading: boolean;
  refresh: () => Promise<void>;
  getNavBadge: (navId: string) => number;
  notificationCount: number;
  adjustNotificationCount: (delta: number) => void;
};

const NavBadgesContext = createContext<NavBadgesContextValue | null>(null);

export function NavBadgesProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [badges, setBadges] = useState<NavBadges>(EMPTY_NAV_BADGES);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setBadges(EMPTY_NAV_BADGES);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<{ badges: NavBadges }>('/nav-badges');
      setBadges({ ...EMPTY_NAV_BADGES, ...data.badges });
    } catch {
      /* keep last known counts */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setBadges(EMPTY_NAV_BADGES);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [authLoading, user, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const adjustNotificationCount = useCallback((delta: number) => {
    setBadges((prev) => ({
      ...prev,
      notifications: Math.max(0, prev.notifications + delta),
    }));
  }, []);

  const value = useMemo<NavBadgesContextValue>(
    () => ({
      badges,
      loading,
      refresh,
      getNavBadge: (navId: string) => badgeForNavId(badges, navId),
      notificationCount: badges[CHROME_NOTIFICATIONS_BADGE_KEY] ?? 0,
      adjustNotificationCount,
    }),
    [badges, loading, refresh, adjustNotificationCount]
  );

  useNavAttentionOnRoute(refresh);

  return <NavBadgesContext.Provider value={value}>{children}</NavBadgesContext.Provider>;
}

export function useNavBadges(): NavBadgesContextValue {
  const ctx = useContext(NavBadgesContext);
  if (!ctx) {
    throw new Error('useNavBadges must be used within NavBadgesProvider');
  }
  return ctx;
}

export function useNavBadgesOptional(): NavBadgesContextValue | null {
  return useContext(NavBadgesContext);
}
