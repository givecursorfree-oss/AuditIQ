import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import { GooeyToaster, gooeyToast } from 'goey-toast';
import 'goey-toast/styles.css';
import { useTheme } from './ThemeContext';

export type ToastVariant = 'success' | 'info' | 'error' | 'warning';

export type ToastInput = {
  message: string;
  title?: string;
  variant?: ToastVariant;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
  /** Stays until the user closes it (attendance location / geofence). */
  persist?: boolean;
};

type AppToastContextValue = {
  showToast: (input: ToastInput) => void;
};

const AppToastContext = createContext<AppToastContextValue | null>(null);

/** Browsers clamp setTimeout delays above 2^31-1 to 1ms. Infinity would auto-close immediately. */
const STICKY_MS = 2_147_483_647;

function fireGooeyToast(input: ToastInput) {
  const variant = input.variant ?? 'info';
  const title = input.title?.trim() || input.message;
  const description =
    input.title?.trim() && input.message !== input.title ? input.message : undefined;
  const stayMs = input.persist ? STICKY_MS : input.durationMs;
  const options = {
    description,
    duration: stayMs,
    timing: stayMs != null ? { displayDuration: stayMs } : undefined,
    action: input.action
      ? { label: input.action.label, onClick: input.action.onClick }
      : undefined,
    showTimestamp: false,
  };

  if (variant === 'success') gooeyToast.success(title, options);
  else if (variant === 'error') gooeyToast.error(title, options);
  else if (variant === 'warning') gooeyToast.warning(title, options);
  else gooeyToast.info(title, options);
}

export function AppToastProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  const showToast = useCallback((input: ToastInput) => {
    fireGooeyToast(input);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <AppToastContext.Provider value={value}>
      {children}
      <GooeyToaster
        position="top-center"
        theme={theme === 'dark' ? 'dark' : 'light'}
        preset="smooth"
        closeButton="top-right"
        showTimestamp={false}
        maxQueue={4}
        queueOverflow="drop-oldest"
        offset="16px"
        gap={12}
      />
    </AppToastContext.Provider>
  );
}

export function useAppToast() {
  const ctx = useContext(AppToastContext);
  if (!ctx) throw new Error('useAppToast must be used within AppToastProvider');
  return ctx;
}

/** Fire-and-forget toast from outside React hooks (login, engagement helpers). */
export function appToast(input: ToastInput) {
  fireGooeyToast(input);
}

/** Direct access when callers want gooeyToast.promise / update. */
export { gooeyToast };
