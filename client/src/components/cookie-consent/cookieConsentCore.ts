/** Cookie consent storage + script gating — port of Framer CookieConsent-ThLpvy. */

export type ConsentCategories = Record<string, boolean> & {
  necessary: boolean;
};

export type StoredConsent = {
  version: string;
  updatedAt: string;
  categories: ConsentCategories;
};

export const DEFAULT_CATEGORIES = ['necessary', 'preferences', 'analytics', 'marketing'] as const;

export function createDefaultToggles(
  keys: string[],
  defaults: { defaultPreferences: boolean; defaultAnalytics: boolean; defaultMarketing: boolean }
): ConsentCategories {
  const next: ConsentCategories = { necessary: true };
  for (const key of keys) {
    if (key === 'necessary') next.necessary = true;
    else if (key === 'preferences') next[key] = defaults.defaultPreferences;
    else if (key === 'analytics') next[key] = defaults.defaultAnalytics;
    else if (key === 'marketing') next[key] = defaults.defaultMarketing;
    else next[key] = false;
  }
  return next;
}

export function createConsentFromToggles(toggles: ConsentCategories, version: string): StoredConsent {
  return {
    version,
    updatedAt: new Date().toISOString(),
    categories: { ...toggles, necessary: true },
  };
}

export function isCategoryAllowed(consent: StoredConsent | null, category: string): boolean {
  if (!consent) return category === 'necessary';
  if (category === 'necessary') return true;
  return Boolean(consent.categories[category]);
}

export function readStoredConsent(cookieName: string, version: string): StoredConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromLs = localStorage.getItem(cookieName);
    const raw = fromLs || readCookie(cookieName);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (!parsed?.version || parsed.version !== version || !parsed.categories) return null;
    parsed.categories.necessary = true;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredConsent(cookieName: string, consent: StoredConsent, expiryDays: number): void {
  const raw = JSON.stringify(consent);
  localStorage.setItem(cookieName, raw);
  const maxAge = Math.max(1, expiryDays) * 24 * 60 * 60;
  document.cookie = `${encodeURIComponent(cookieName)}=${encodeURIComponent(raw)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

export function clearStoredConsent(cookieName: string): void {
  localStorage.removeItem(cookieName);
  document.cookie = `${encodeURIComponent(cookieName)}=; Max-Age=0; Path=/`;
}

function readCookie(name: string): string | null {
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (decodeURIComponent(k) === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export type ConsentScript = {
  el: HTMLScriptElement;
  categories: string[];
  src: string | null;
  inline: string;
  type: string | null;
  service: string | null;
  cleanCookies: string[];
  cleanStorage: string[];
  loadOnce: boolean;
  fingerprint: string;
};

export function scanConsentScripts(): ConsentScript[] {
  const nodes = Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-cookie-category], script[data-cookie-categories]'));
  return nodes.map((el) => {
    const multi = el.getAttribute('data-cookie-categories');
    const single = el.getAttribute('data-cookie-category');
    const categories = (multi || single || 'necessary')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const src = el.getAttribute('data-cookie-src') || el.getAttribute('src');
    const inline = el.textContent || '';
    const fingerprint = `${categories.join(',')}|${src || ''}|${inline.slice(0, 80)}`;
    return {
      el,
      categories,
      src,
      inline,
      type: el.getAttribute('data-cookie-type'),
      service: el.getAttribute('data-cookie-service'),
      cleanCookies: (el.getAttribute('data-cookie-clean-cookies') || '').split(',').map((s) => s.trim()).filter(Boolean),
      cleanStorage: (el.getAttribute('data-cookie-clean-storage') || '').split(',').map((s) => s.trim()).filter(Boolean),
      loadOnce: el.getAttribute('data-cookie-load-once') !== 'false',
      fingerprint,
    };
  });
}

export function getCategoryKeysFromScripts(scripts: ConsentScript[]): string[] {
  const set = new Set<string>(DEFAULT_CATEGORIES);
  for (const s of scripts) {
    for (const c of s.categories) set.add(c);
  }
  return Array.from(set);
}

const loadedFingerprints = new Set<string>();

export function applyConsent(
  consent: StoredConsent,
  scripts: ConsentScript[],
  opts: { googleConsentMode: boolean; consentEventName: string; debug?: boolean }
): void {
  if (opts.googleConsentMode) updateGoogleConsent(consent);

  for (const script of scripts) {
    const allowed = script.categories.every((c) => isCategoryAllowed(consent, c));
    if (allowed) {
      activateScript(script);
    } else {
      deactivateCleanup(script);
    }
  }

  window.dispatchEvent(new CustomEvent(opts.consentEventName, { detail: consent }));
  if (opts.debug) console.info('[Cookie Consent] Applied', consent);
}

function activateScript(script: ConsentScript): void {
  if (script.loadOnce && loadedFingerprints.has(script.fingerprint)) return;
  if (script.el.dataset.cookieActivated === '1') return;

  const next = document.createElement('script');
  if (script.type) next.type = script.type;
  else next.type = 'text/javascript';
  if (script.src) next.src = script.src;
  else next.text = script.inline;
  next.dataset.cookieActivatedFrom = script.fingerprint;
  script.el.insertAdjacentElement('afterend', next);
  script.el.dataset.cookieActivated = '1';
  loadedFingerprints.add(script.fingerprint);
}

function deactivateCleanup(script: ConsentScript): void {
  for (const name of script.cleanCookies) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
  for (const key of script.cleanStorage) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function updateGoogleConsent(consent: StoredConsent): void {
  const w = window as Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };
  w.dataLayer = w.dataLayer || [];
  if (typeof w.gtag !== 'function') {
    w.gtag = function gtag(...args: unknown[]) {
      w.dataLayer!.push(args);
    };
  }
  w.gtag('consent', 'update', {
    functionality_storage: 'granted',
    security_storage: 'granted',
    analytics_storage: isCategoryAllowed(consent, 'analytics') ? 'granted' : 'denied',
    ad_storage: isCategoryAllowed(consent, 'marketing') ? 'granted' : 'denied',
    ad_user_data: isCategoryAllowed(consent, 'marketing') ? 'granted' : 'denied',
    ad_personalization: isCategoryAllowed(consent, 'marketing') ? 'granted' : 'denied',
    personalization_storage: isCategoryAllowed(consent, 'preferences') ? 'granted' : 'denied',
  });
}

declare global {
  interface Window {
    cookieConsent?: {
      state: StoredConsent | null;
      hasConsent: (category: string) => boolean;
      openSettings: () => void;
      reset: () => void;
    };
    openCookieSettings?: () => void;
  }
}
