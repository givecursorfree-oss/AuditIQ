import { useEffect, useRef, useCallback } from 'react';

export type ActivityStatus = 'active' | 'away' | 'offline';

interface UseActivityMonitorOptions {
  awayThresholdMs?: number;
  enabled?: boolean;
  onStatusChange: (status: ActivityStatus) => void;
  onAway?: () => void;
  onReturn?: () => void;
}

export function useActivityMonitor({
  awayThresholdMs = 5 * 60 * 1000,
  enabled = true,
  onStatusChange,
  onAway,
  onReturn,
}: UseActivityMonitorOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const statusRef = useRef<ActivityStatus>('active');
  const onStatusChangeRef = useRef(onStatusChange);
  const onAwayRef = useRef(onAway);
  const onReturnRef = useRef(onReturn);

  onStatusChangeRef.current = onStatusChange;
  onAwayRef.current = onAway;
  onReturnRef.current = onReturn;

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    if (statusRef.current === 'away') {
      statusRef.current = 'active';
      onStatusChangeRef.current('active');
      onReturnRef.current?.();
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      statusRef.current = 'away';
      onStatusChangeRef.current('away');
      onAwayRef.current?.();
    }, awayThresholdMs);
  }, [awayThresholdMs, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      clearTimeout(timerRef.current);
    };
  }, [resetTimer, enabled]);
}
