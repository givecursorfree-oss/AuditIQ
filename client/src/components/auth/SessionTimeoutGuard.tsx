import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SESSION_IDLE_MS, SESSION_IDLE_WARN_MS, SESSION_WARN_AT_MS } from '@/lib/sessionTimeout';

function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Idle session timeout: warn 2 min before logout, then end session.
 * Absolute 12h cap is enforced on the server during /auth/refresh.
 */
export function SessionTimeoutGuard() {
  const { user, logout } = useAuth();
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(SESSION_IDLE_WARN_MS / 1000));
  const lastActivityRef = useRef(Date.now());
  const warningOpenRef = useRef(false);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tickRef = useRef<ReturnType<typeof setInterval>>();
  const loggingOutRef = useRef(false);

  warningOpenRef.current = warningOpen;

  const endSession = useCallback(
    async (reason: 'idle' | 'absolute') => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      try {
        await logout();
      } catch {
        /* ignore */
      }
      window.location.href = `/login?session=${reason}`;
    },
    [logout]
  );

  const clearTimers = useCallback(() => {
    clearTimeout(warnTimerRef.current);
    clearTimeout(logoutTimerRef.current);
    clearInterval(tickRef.current);
  }, []);

  const armTimers = useCallback(() => {
    clearTimers();
    setWarningOpen(false);
    lastActivityRef.current = Date.now();

    warnTimerRef.current = setTimeout(() => {
      setSecondsLeft(Math.floor(SESSION_IDLE_WARN_MS / 1000));
      setWarningOpen(true);
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - lastActivityRef.current;
        const remainingMs = SESSION_IDLE_MS - elapsed;
        setSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
      }, 250);
    }, SESSION_WARN_AT_MS);

    logoutTimerRef.current = setTimeout(() => {
      void endSession('idle');
    }, SESSION_IDLE_MS);
  }, [clearTimers, endSession]);

  const staySignedIn = useCallback(() => {
    armTimers();
  }, [armTimers]);

  useEffect(() => {
    if (!user) {
      clearTimers();
      setWarningOpen(false);
      loggingOutRef.current = false;
      return;
    }

    const onActivity = () => {
      if (warningOpenRef.current) return;
      armTimers();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    armTimers();

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearTimers();
    };
  }, [user, armTimers, clearTimers]);

  if (!user) return null;

  return (
    <Dialog
      open={warningOpen}
      onOpenChange={(open) => {
        if (!open) staySignedIn();
      }}
    >
      <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Session expiring</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground tabular-nums">
          Signing out in {formatSeconds(secondsLeft)}
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => void endSession('idle')}>
            Sign out
          </Button>
          <Button type="button" onClick={staySignedIn}>
            Stay signed in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
