'use client';

/**
 * Cookie Consent Banner — functional port of Framer module
 * https://framer.com/m/CookieConsent-ThLpvy.js@pDSMdvMpMH1qFXjPsryw
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  applyConsent,
  clearStoredConsent,
  createConsentFromToggles,
  createDefaultToggles,
  getCategoryKeysFromScripts,
  isCategoryAllowed,
  readStoredConsent,
  scanConsentScripts,
  updateGoogleConsent,
  writeStoredConsent,
  type ConsentCategories,
  type ConsentScript,
  type StoredConsent,
} from './cookieConsentCore';

const DEFAULT_PROPS = {
  content: {
    title: 'Cookie preferences',
    message:
      'We use cookies and similar technologies to keep the site working, improve your experience, measure performance, and support marketing.',
    settingsTitle: 'Cookie settings',
    settingsMessage:
      'Choose which categories you want to allow. Necessary cookies are always active because the site depends on them.',
  },
  buttons: {
    acceptAll: 'Accept all',
    rejectAll: 'Reject all',
    customize: 'Customize',
    save: 'Save settings',
    back: 'Back',
  },
  categories: {
    necessaryLabel: 'Necessary',
    necessaryDescription: 'Required for core site functionality, security, and consent storage.',
    preferencesLabel: 'Preferences',
    preferencesDescription: 'Stores choices that improve the experience, such as language or interface preferences.',
    analyticsLabel: 'Analytics',
    analyticsDescription: 'Helps measure visits, behavior, performance, and content effectiveness.',
    marketingLabel: 'Marketing',
    marketingDescription: 'Supports ads, retargeting, attribution, and campaign measurement.',
  },
  privacy: {
    privacyLabel: 'Privacy policy',
    privacyUrl: '/privacy-policy',
  },
  consent: {
    cookieName: 'auditiq_cookie_consent',
    consentVersion: '1',
    expiryDays: 180,
    defaultPreferences: false,
    defaultAnalytics: false,
    defaultMarketing: false,
    showRejectAll: true,
  },
  integrations: {
    scanScripts: true,
    observeNewScripts: true,
    googleConsentMode: true,
    consentEventName: 'cookieConsentUpdated',
    settingsFunctionName: 'openCookieSettings',
    debug: false,
  },
  floatingButton: {
    enabled: true,
    position: 'bottomLeft' as const,
    label: 'Cookie settings',
    showLabel: false,
    offset: 16,
    size: 48,
  },
};

function categoryLabel(key: string): string {
  const c = DEFAULT_PROPS.categories;
  if (key === 'necessary') return c.necessaryLabel;
  if (key === 'preferences') return c.preferencesLabel;
  if (key === 'analytics') return c.analyticsLabel;
  if (key === 'marketing') return c.marketingLabel;
  return key.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function categoryDescription(key: string): string {
  const c = DEFAULT_PROPS.categories;
  if (key === 'necessary') return c.necessaryDescription;
  if (key === 'preferences') return c.preferencesDescription;
  if (key === 'analytics') return c.analyticsDescription;
  if (key === 'marketing') return c.marketingDescription;
  return 'Controls scripts and storage assigned to this custom consent category.';
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors',
        checked ? 'bg-zinc-900' : 'bg-zinc-300',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}

export default function CookieConsentBanner() {
  const props = DEFAULT_PROPS;
  const [ready, setReady] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [floatingVisible, setFloatingVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'banner' | 'settings'>('banner');
  const [storedConsent, setStoredConsent] = useState<StoredConsent | null>(null);
  const [detectedScripts, setDetectedScripts] = useState<ConsentScript[]>([]);
  const [toggles, setToggles] = useState<ConsentCategories>({ necessary: true });

  const categoryKeys = useMemo(() => getCategoryKeysFromScripts(detectedScripts), [detectedScripts]);

  const scanAndStoreScripts = useCallback(() => {
    if (!props.integrations.scanScripts) return [] as ConsentScript[];
    const scripts = scanConsentScripts();
    setDetectedScripts(scripts);
    return scripts;
  }, [props.integrations.scanScripts]);

  useEffect(() => {
    const scripts = scanAndStoreScripts();
    const keys = getCategoryKeysFromScripts(scripts);
    const defaults = createDefaultToggles(keys, props.consent);
    if (props.integrations.googleConsentMode) {
      updateGoogleConsent(createConsentFromToggles(defaults, props.consent.consentVersion));
    }

    const existing = readStoredConsent(props.consent.cookieName, props.consent.consentVersion);
    if (existing) {
      const normalized = {
        ...existing,
        categories: { ...createDefaultToggles(keys, props.consent), ...existing.categories, necessary: true },
      };
      setStoredConsent(normalized);
      setToggles(normalized.categories);
      setBannerVisible(false);
      setFloatingVisible(props.floatingButton.enabled);
      applyConsent(normalized, scripts, props.integrations);
    } else {
      setStoredConsent(null);
      setToggles(defaults);
      setBannerVisible(true);
      setFloatingVisible(false);
      setView('banner');
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!props.integrations.observeNewScripts || !props.integrations.scanScripts) return;
    let raf = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const scripts = scanAndStoreScripts();
        if (storedConsent) applyConsent(storedConsent, scripts, props.integrations);
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [storedConsent, scanAndStoreScripts, props.integrations]);

  useEffect(() => {
    if (bannerVisible) requestAnimationFrame(() => setMounted(true));
    else setMounted(false);
  }, [bannerVisible]);

  const openSettings = useCallback(() => {
    scanAndStoreScripts();
    setView('settings');
    setBannerVisible(true);
    setFloatingVisible(false);
  }, [scanAndStoreScripts]);

  const resetConsent = useCallback(() => {
    clearStoredConsent(props.consent.cookieName);
    const scripts = scanAndStoreScripts();
    const keys = getCategoryKeysFromScripts(scripts);
    const defaults = createDefaultToggles(keys, props.consent);
    setStoredConsent(null);
    setToggles(defaults);
    setView('banner');
    setBannerVisible(true);
    setFloatingVisible(false);
    if (props.integrations.googleConsentMode) {
      updateGoogleConsent(createConsentFromToggles(defaults, props.consent.consentVersion));
    }
  }, [props.consent, props.integrations.googleConsentMode, scanAndStoreScripts]);

  useEffect(() => {
    window.cookieConsent = {
      state: storedConsent,
      hasConsent: (category) => isCategoryAllowed(storedConsent, category),
      openSettings,
      reset: resetConsent,
    };
    window.openCookieSettings = openSettings;
    return () => {
      if (window.openCookieSettings === openSettings) delete window.openCookieSettings;
    };
  }, [storedConsent, openSettings, resetConsent]);

  const saveConsent = useCallback(
    (nextToggles: ConsentCategories) => {
      const scripts = scanAndStoreScripts();
      const nextConsent = createConsentFromToggles(nextToggles, props.consent.consentVersion);
      setStoredConsent(nextConsent);
      setToggles(nextConsent.categories);
      writeStoredConsent(props.consent.cookieName, nextConsent, props.consent.expiryDays);
      applyConsent(nextConsent, scripts, props.integrations);
      setBannerVisible(false);
      setFloatingVisible(props.floatingButton.enabled);
    },
    [props.consent, props.floatingButton.enabled, props.integrations, scanAndStoreScripts]
  );

  const acceptAll = useCallback(() => {
    const scripts = scanAndStoreScripts();
    const keys = getCategoryKeysFromScripts(scripts);
    const all: ConsentCategories = { necessary: true };
    for (const key of keys) all[key] = true;
    saveConsent(all);
  }, [saveConsent, scanAndStoreScripts]);

  const rejectAll = useCallback(() => {
    const scripts = scanAndStoreScripts();
    const keys = getCategoryKeysFromScripts(scripts);
    const next = createDefaultToggles(keys, {
      defaultPreferences: false,
      defaultAnalytics: false,
      defaultMarketing: false,
    });
    saveConsent(next);
  }, [saveConsent, scanAndStoreScripts]);

  if (!ready) return null;

  const panel = bannerVisible ? (
    <div
      className={cn(
        'fixed z-[999999] w-[min(100%-2rem,28rem)] rounded-[20px] border border-black/12 bg-white p-[22px] text-zinc-900 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.45)] transition-all duration-300',
        'bottom-4 left-1/2 -translate-x-1/2 sm:bottom-6',
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-consent-title"
    >
      {view === 'banner' ? (
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <h2 id="cookie-consent-title" className="text-lg font-semibold tracking-tight">
              {props.content.title}
            </h2>
            <p className="text-sm leading-relaxed text-zinc-600">{props.content.message}</p>
            {props.privacy.privacyUrl ? (
              <Link to={props.privacy.privacyUrl} className="text-sm font-medium underline underline-offset-2">
                {props.privacy.privacyLabel}
              </Link>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
              onClick={acceptAll}
            >
              {props.buttons.acceptAll}
            </button>
            {props.consent.showRejectAll ? (
              <button
                type="button"
                className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
                onClick={rejectAll}
              >
                {props.buttons.rejectAll}
              </button>
            ) : null}
            <button
              type="button"
              className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
              onClick={() => setView('settings')}
            >
              {props.buttons.customize}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <h2 id="cookie-consent-title" className="text-lg font-semibold tracking-tight">
              {props.content.settingsTitle}
            </h2>
            <p className="text-sm leading-relaxed text-zinc-600">{props.content.settingsMessage}</p>
          </div>
          <ul className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
            {categoryKeys.map((key) => (
              <li key={key} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{categoryLabel(key)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{categoryDescription(key)}</p>
                </div>
                <Toggle
                  label={categoryLabel(key)}
                  checked={Boolean(toggles[key])}
                  disabled={key === 'necessary'}
                  onChange={(v) => setToggles((cur) => ({ ...cur, [key]: v, necessary: true }))}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
              onClick={() => setView('banner')}
            >
              {props.buttons.back}
            </button>
            <button
              type="button"
              className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
              onClick={() => saveConsent({ ...toggles, necessary: true })}
            >
              {props.buttons.save}
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const floating =
    floatingVisible && props.floatingButton.enabled ? (
      <button
        type="button"
        onClick={openSettings}
        aria-label={props.floatingButton.label}
        className={cn(
          'fixed z-[999998] flex items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition hover:scale-105',
          props.floatingButton.position === 'bottomLeft' ? 'bottom-4 left-4' : 'bottom-4 right-4'
        )}
        style={{
          width: props.floatingButton.size,
          height: props.floatingButton.size,
          margin: props.floatingButton.offset / 4,
        }}
      >
        <Cookie size={22} weight="fill" />
        {props.floatingButton.showLabel ? (
          <span className="ml-2 text-xs font-medium">{props.floatingButton.label}</span>
        ) : null}
      </button>
    ) : null;

  return (
    <>
      {panel}
      {floating}
    </>
  );
}
