/** True when the event target is (or is inside) an editable field. */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const el = target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    if (type === 'button' || type === 'checkbox' || type === 'radio' || type === 'submit' || type === 'reset' || type === 'file') {
      return false;
    }
  }
  return true;
}

// ponytail: self-check — fails loudly in unit-like assert if logic regresses
export function assertEditableKeyboardTargetLogic(): void {
  const mk = (tag: string, attrs: Record<string, string> = {}) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };
  if (typeof document === 'undefined') return;
  console.assert(isEditableKeyboardTarget(mk('input', { type: 'text' })) === true);
  console.assert(isEditableKeyboardTarget(mk('input', { type: 'checkbox' })) === false);
  console.assert(isEditableKeyboardTarget(mk('button')) === false);
  console.assert(isEditableKeyboardTarget(mk('textarea')) === true);
}
