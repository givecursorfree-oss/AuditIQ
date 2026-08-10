import { useEffect, useRef } from 'react';

export const BOUNCE_VARIANTS: Record<string, number> = {
  'idle-timer': 0.3,
  'idle-notification': 0.38,
  'idle-todo': 0.35,
  'timer-notification': 0.42,
  'timer-todo': 0.32,
  'notification-timer': 0.38,
  'notification-todo': 0.35,
  'todo-timer': 0.32,
  'timer-idle': 0.28,
  'notification-idle': 0.3,
  'todo-idle': 0.28,
};

export const DEFAULT_BOUNCE = 0.36;
const TIMER_TICK_MS = 1000;
export const ISLAND_COLLAPSED_MAX_W = '11rem';
export const ISLAND_EXPANDED_MAX_W = 'min(100vw - 2rem, 17.5rem)';

export const EXPAND_SPRING = { type: 'spring' as const, bounce: 0.32, stiffness: 520, damping: 34 };

export function shellSpring(bounce: number, reduced: boolean) {
  if (reduced) return { duration: 0 };
  return { type: 'spring' as const, bounce, stiffness: 420, damping: 30 };
}

export type IslandView = 'idle' | 'timer' | 'notification' | 'todo';

export type IslandNotificationPayload = {
  id: string;
  senderName: string;
  senderInitials: string;
  context: string;
  message: string;
  timeLabel: string;
  onDismiss?: () => void;
  onOpen?: () => void;
};

export type IslandTimerPayload = {
  startedAt: string;
  subtitle: string;
  isPaused?: boolean;
  elapsedSeconds?: number;
  stopping?: boolean;
  onOpen?: () => void;
  onStop?: () => void | Promise<void>;
};

export type IslandTodoPayload = {
  count: number;
  title: string;
  subtitle?: string;
  onOpen?: () => void;
};

export interface DynamicIslandProps {
  view: IslandView;
  className?: string;
  notification?: IslandNotificationPayload | null;
  timer?: IslandTimerPayload | null;
  todo?: IslandTodoPayload | null;
  visible?: boolean;
}

export type ExpandSpring = typeof EXPAND_SPRING | { duration: number };

function fmtElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useElapsedClock(startedAt: string, isPaused?: boolean, frozenSeconds?: number) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const paintFrozen = (elapsed: number) => {
      if (labelRef.current) {
        labelRef.current.textContent = fmtElapsed(elapsed);
      }
      if (barRef.current) {
        const pct = Math.min(100, ((elapsed % 900) / 900) * 100);
        barRef.current.style.width = `${pct}%`;
      }
    };

    if (isPaused && frozenSeconds != null) {
      paintFrozen(frozenSeconds);
      return;
    }

    const startMs = new Date(startedAt).getTime();
    if (Number.isNaN(startMs)) return;

    const paint = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      paintFrozen(elapsed);
    };

    paint();
    const id = window.setInterval(paint, TIMER_TICK_MS);
    return () => window.clearInterval(id);
  }, [startedAt, isPaused, frozenSeconds]);

  return { labelRef, barRef };
}
