import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { CheckCircle, Info, WarningCircle, XCircle } from '@phosphor-icons/react';

export type ToastVariant = 'success' | 'info' | 'error' | 'warning';

export type ToastPayload = {
  id: string;
  message: string;
  title?: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};

type AppToastContextValue = {
  showToast: (input: {
    message: string;
    title?: string;
    variant?: ToastVariant;
    action?: { label: string; onClick: () => void };
    durationMs?: number;
  }) => void;
};

const AppToastContext = createContext<AppToastContextValue | null>(null);

let globalToast: AppToastContextValue | null = null;

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; icon: React.ReactNode }
> = {
  success: {
    border: 'border-emerald-500/30',
    icon: <CheckCircle size={20} weight="fill" className="text-emerald-500 shrink-0" />,
  },
  info: {
    border: 'border-primary/30',
    icon: <Info size={20} weight="fill" className="text-primary shrink-0" />,
  },
  error: {
    border: 'border-destructive/30',
    icon: <XCircle size={20} weight="fill" className="text-destructive shrink-0" />,
  },
  warning: {
    border: 'border-amber-500/30',
    icon: <WarningCircle size={20} weight="fill" className="text-amber-500 shrink-0" />,
  },
};

export function AppToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const counter = useRef(0);
  const reduceMotion = useReducedMotion();

  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (input: {
      message: string;
      title?: string;
      variant?: ToastVariant;
      action?: { label: string; onClick: () => void };
      durationMs?: number;
    }) => {
      const id = `toast-${++counter.current}`;
      const toast: ToastPayload = {
        id,
        message: input.message,
        title: input.title,
        variant: input.variant ?? 'info',
        action: input.action,
        durationMs: input.durationMs,
      };
      setToasts((prev) => [...prev.slice(-2), toast]);
      const duration = input.durationMs ?? (input.action ? 8000 : 4500);
      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const value = { showToast };

  globalToast = value;

  return (
    <AppToastContext.Provider value={value}>
      {children}
      <div
        className="fixed top-4 right-4 z-[10004] flex flex-col gap-2 max-w-sm pointer-events-none"
        aria-live="polite"
        aria-relevant="additions"
      >
        <AnimatePresence>
          {toasts.map((toast) => {
            const style = VARIANT_STYLES[toast.variant];
            return (
              <m.div
                key={toast.id}
                role="status"
                initial={reduceMotion ? false : { opacity: 0, x: 24, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 16, scale: 0.96 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 28 }}
                className={`pointer-events-auto rounded-lg border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-md ${style.border}`}
              >
                <div className="flex items-start gap-2.5">
                  {style.icon}
                  <div className="min-w-0 flex-1">
                    {toast.title && (
                      <p className="text-sm font-semibold text-foreground">{toast.title}</p>
                    )}
                    <p className={`text-sm text-foreground/90 ${toast.title ? 'mt-0.5' : ''}`}>
                      {toast.message}
                    </p>
                    {toast.action ? (
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-primary hover:underline"
                        onClick={() => {
                          toast.action?.onClick();
                          dismiss(toast.id);
                        }}
                      >
                        {toast.action.label}
                      </button>
                    ) : null}
                  </div>
                </div>
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </AppToastContext.Provider>
  );
}

export function useAppToast() {
  const ctx = useContext(AppToastContext);
  if (!ctx) throw new Error('useAppToast must be used within AppToastProvider');
  return ctx;
}

/** For modules that cannot use hooks (e.g. fire-and-forget after dialog). */
export function appToast(input: {
  message: string;
  title?: string;
  variant?: ToastVariant;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}) {
  globalToast?.showToast(input);
}
