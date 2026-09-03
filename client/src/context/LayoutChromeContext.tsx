import { createContext, useContext, useMemo, useRef, useCallback, useEffect, useState, type ReactNode } from 'react';
import { isEditableKeyboardTarget } from '@/lib/keyboard';
import { KeyboardShortcutsDialog } from '@/components/layout/KeyboardShortcutsDialog';

type LayoutChromeContextValue = {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  focusSearch: () => void;
  registerFocusSearch: (fn: (() => void) | null) => void;
  registerToggleNotifications: (fn: (() => void) | null) => void;
  toggleNotifications: () => void;
  openShortcutsHelp: () => void;
};

const LayoutChromeContext = createContext<LayoutChromeContextValue | null>(null);

export function LayoutChromeProvider({ children }: { children: ReactNode }) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const notifToggleRef = useRef<(() => void) | null>(null);
  const focusSearchOverrideRef = useRef<(() => void) | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const defaultFocusSearch = useCallback(() => {
    const el = searchInputRef.current;
    if (!el) return;
    el.focus();
    el.select?.();
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const focusSearch = useCallback(() => {
    if (focusSearchOverrideRef.current) {
      focusSearchOverrideRef.current();
      return;
    }
    defaultFocusSearch();
  }, [defaultFocusSearch]);

  const registerFocusSearch = useCallback((fn: (() => void) | null) => {
    focusSearchOverrideRef.current = fn;
  }, []);

  const registerToggleNotifications = useCallback((fn: (() => void) | null) => {
    notifToggleRef.current = fn;
  }, []);

  const toggleNotifications = useCallback(() => {
    notifToggleRef.current?.();
  }, []);

  const openShortcutsHelp = useCallback(() => {
    setShortcutsOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (shortcutsOpen) return;
      if (isEditableKeyboardTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      // "?" opens help (Shift+/ on US layouts)
      if (key === '?' && !mod && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (key === '/' && !mod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        focusSearch();
        return;
      }

      if (key === 'k' && mod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        focusSearch();
        return;
      }

      if (key === 'n' && mod && e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleNotifications();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusSearch, toggleNotifications, shortcutsOpen]);

  const value = useMemo(
    () => ({
      searchInputRef,
      focusSearch,
      registerFocusSearch,
      registerToggleNotifications,
      toggleNotifications,
      openShortcutsHelp,
    }),
    [focusSearch, registerFocusSearch, registerToggleNotifications, toggleNotifications, openShortcutsHelp]
  );

  return (
    <LayoutChromeContext.Provider value={value}>
      {children}
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </LayoutChromeContext.Provider>
  );
}

export function useLayoutChrome() {
  const ctx = useContext(LayoutChromeContext);
  if (!ctx) throw new Error('useLayoutChrome must be used within LayoutChromeProvider');
  return ctx;
}
