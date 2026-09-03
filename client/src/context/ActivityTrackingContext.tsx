import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { isStaffPresenceRole } from '@/lib/presence';
import { isAttendanceEligible } from '@/lib/attendancePopup';
import { useActivityMonitor, type ActivityStatus } from '@/hooks/useActivityMonitor';
import { notifyStopwatchChanged } from '@/lib/stopwatchEvents';

interface ActivityTrackingContextValue {
  activityStatus: ActivityStatus;
}

const ActivityTrackingContext = createContext<ActivityTrackingContextValue>({
  activityStatus: 'offline',
});

const SYNC_INTERVAL_MS = 60_000;

export function ActivityTrackingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activityStatus, setActivityStatus] = useState<ActivityStatus>('offline');
  const activeAccumRef = useRef(0);
  const awayAccumRef = useRef(0);
  const lastTickRef = useRef(Date.now());
  const statusRef = useRef<ActivityStatus>('offline');

  const enabled = Boolean(user && isStaffPresenceRole(user.role));
  const [hasClockIn, setHasClockIn] = useState(false);

  const pushStatus = useCallback(
    async (status: ActivityStatus) => {
      if (!user?.id) return;
      try {
        await api.put(`/staff/${user.id}/status`, { activityStatus: status });
      } catch {
        /* admin polls /api/staff/statuses as fallback */
      }
    },
    [user?.id]
  );

  useActivityMonitor({
    enabled,
    onStatusChange: (status) => {
      statusRef.current = status;
      setActivityStatus(status);
      void pushStatus(status);
    },
    onAway: () => {
      void api
        .post('/stopwatch/pause')
        .then(() => notifyStopwatchChanged())
        .catch(() => {});
    },
    onReturn: () => {
      void api
        .post('/stopwatch/resume')
        .then(() => notifyStopwatchChanged())
        .catch(() => {});
    },
  });

  useEffect(() => {
    if (!enabled || !user?.id) {
      setActivityStatus('offline');
      setHasClockIn(false);
      return;
    }
    setActivityStatus('active');
    statusRef.current = 'active';
    void pushStatus('active');

    void api
      .get<{ checkIn?: string | null } | null>('/attendance/me/today')
      .then((r) => setHasClockIn(Boolean(r.data?.checkIn)))
      .catch(() => setHasClockIn(false));

    return () => {
      void api.put(`/staff/${user.id}/status`, { activityStatus: 'offline' }).catch(() => {});
    };
  }, [enabled, user?.id, pushStatus]);

  useEffect(() => {
    if (!enabled || !hasClockIn || !isAttendanceEligible(user?.role ?? '')) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const deltaSec = Math.floor((now - lastTickRef.current) / 1000);
      lastTickRef.current = now;
      if (deltaSec <= 0) return;

      if (statusRef.current === 'active') activeAccumRef.current += deltaSec;
      else if (statusRef.current === 'away') awayAccumRef.current += deltaSec;

      const active = activeAccumRef.current;
      const away = awayAccumRef.current;
      if (active === 0 && away === 0) return;

      activeAccumRef.current = 0;
      awayAccumRef.current = 0;

      void api.patch('/attendance/activity', { activeSeconds: active, awaySeconds: away }).catch(() => {});
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, hasClockIn, user?.role]);

  useEffect(() => {
    if (!enabled) return;
    const onClockIn = () => setHasClockIn(true);
    window.addEventListener('auditiq:clock-in', onClockIn);
    return () => window.removeEventListener('auditiq:clock-in', onClockIn);
  }, [enabled]);

  const value = useMemo(() => ({ activityStatus }), [activityStatus]);

  return (
    <ActivityTrackingContext.Provider value={value}>
      {children}
    </ActivityTrackingContext.Provider>
  );
}
