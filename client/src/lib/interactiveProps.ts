import type { KeyboardEvent } from 'react';

/** Activate a click-style action from Enter or Space (for non-button elements). */
export function onKeyboardClick(event: KeyboardEvent, action: () => void): void {
  // Only act when the key event originates on the element itself, not when it
  // bubbles up from a focusable child (e.g. typing a space inside a modal input
  // must not trigger the backdrop's close action).
  if (event.target !== event.currentTarget) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

/** Props for a focusable div that behaves like a button for mouse and keyboard users. */
export function clickableDivProps(action: () => void, label: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: action,
    onKeyDown: (event: KeyboardEvent) => onKeyboardClick(event, action),
  };
}

/** Backdrop overlay that closes on click or Enter/Space. */
export function modalBackdropProps(onClose: () => void, label = 'Close dialog') {
  return clickableDivProps(onClose, label);
}
