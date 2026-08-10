export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PAD = 6;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Split comma-separated selector list (first match wins). */
function parseTourSelectors(selector: string): string[] {
  return selector.split(',').flatMap((s) => {
    const trimmed = s.trim();
    return trimmed ? [trimmed] : [];
  });
}

function isElementVisibleInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;

  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) {
    return false;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return rect.bottom > 4 && rect.right > 4 && rect.top < vh - 4 && rect.left < vw - 4;
}

export function findTourTarget(selector: string): Element | null {
  for (const sel of parseTourSelectors(selector)) {
    const el = document.querySelector(sel);
    if (el && isElementVisibleInViewport(el)) return el;
  }
  return null;
}

/** True if any matching element lives inside the app sidebar (even when off-screen). */
export function hasSidebarTourTarget(selector: string): boolean {
  for (const sel of parseTourSelectors(selector)) {
    const el = document.querySelector(sel);
    if (el?.closest('[data-sidebar="sidebar"]')) return true;
  }
  return false;
}

export function measureTourTarget(selector: string): SpotlightRect | null {
  const el = findTourTarget(selector);
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - SPOTLIGHT_PAD,
    left: rect.left - SPOTLIGHT_PAD,
    width: rect.width + SPOTLIGHT_PAD * 2,
    height: rect.height + SPOTLIGHT_PAD * 2,
  };
}

export function stepTargetExists(selector: string): boolean {
  return parseTourSelectors(selector).some((sel) => Boolean(document.querySelector(sel)));
}

/** Expand collapsed sidebar accordion groups that contain the tour target. */
export async function expandTourTargetAncestors(selector: string): Promise<void> {
  for (const sel of parseTourSelectors(selector)) {
    const el = document.querySelector(sel);
    if (!el) continue;

    let group = el.closest('[data-sidebar="group"]');
    while (group) {
      const toggle = group.querySelector(':scope > button[aria-expanded="false"]');
      if (toggle instanceof HTMLButtonElement) {
        toggle.click();
        await delay(220);
      }
      group = group.parentElement?.closest('[data-sidebar="group"]') ?? null;
    }
    break;
  }
}
