import { createContext, useContext, useMemo, useRef, useCallback, type ReactNode } from 'react';

type LayoutChromeContextValue = {
  searchInputRef: React.RefObject<HTMLInputElement>;
  focusSearch: () => void;
  registerToggleNotifications: (fn: () => void) => void;
  toggleNotifications: () => void;
};

const LayoutChromeContext = createContext<LayoutChromeContextValue | null>(null);

export function LayoutChromeProvider({ children }: { children: ReactNode }) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const notifToggleRef = useRef<(() => void) | null>(null);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const registerToggleNotifications = useCallback((fn: () => void) => {
    notifToggleRef.current = fn;
  }, []);

  const toggleNotifications = useCallback(() => {
    notifToggleRef.current?.();
  }, []);

  const value = useMemo(
    () => ({ searchInputRef, focusSearch, registerToggleNotifications, toggleNotifications }),
    [focusSearch, registerToggleNotifications, toggleNotifications]
  );

  return (
    <LayoutChromeContext.Provider value={value}>
      {children}
    </LayoutChromeContext.Provider>
  );
}

export function useLayoutChrome() {
  const ctx = useContext(LayoutChromeContext);
  if (!ctx) throw new Error('useLayoutChrome must be used within LayoutChromeProvider');
  return ctx;
}
