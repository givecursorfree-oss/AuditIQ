/** Canonical app keyboard shortcuts (labels for Settings / ? help). */

export type ShortcutRow = {
  keys: string[];
  action: string;
  scope: 'Global' | 'Time Tracker' | 'Chat' | 'Claims' | 'Search';
};

/** Mac-style display; Windows users still see Cmd — we also show Ctrl where relevant. */
export function modKeyLabel(): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) {
    return '⌘';
  }
  return 'Ctrl';
}

export function appShortcutRows(mod: string = modKeyLabel()): ShortcutRow[] {
  return [
    { keys: ['/'], action: 'Focus search', scope: 'Global' },
    { keys: [mod, 'K'], action: 'Focus search', scope: 'Global' },
    { keys: [mod, 'B'], action: 'Toggle sidebar', scope: 'Global' },
    { keys: [mod, 'Shift', 'N'], action: 'Open notifications', scope: 'Global' },
    { keys: ['?'], action: 'Show this shortcuts list', scope: 'Global' },
    { keys: ['Esc'], action: 'Close search, panels, or lightbox', scope: 'Global' },
    { keys: ['Space'], action: 'Pause / resume stopwatch', scope: 'Time Tracker' },
    { keys: ['←', '→'], action: 'Previous / next receipt', scope: 'Claims' },
    { keys: ['Enter'], action: 'Send message (Shift+Enter for new line)', scope: 'Chat' },
    { keys: [mod, 'Enter'], action: 'Send client submission reply', scope: 'Chat' },
  ];
}
