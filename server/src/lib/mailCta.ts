import { getEnv } from './env.js';

/** Absolute API origin for tokenized email actions (leave approve/reject). */
export function apiPublicOrigin(): string {
  const env = getEnv();
  if (env.API_PUBLIC_URL) {
    try {
      return new URL(env.API_PUBLIC_URL).origin;
    } catch {
      /* fall through */
    }
  }
  const redirect = env.GOOGLE_REDIRECT_URI;
  if (redirect) {
    try {
      return new URL(redirect).origin;
    } catch {
      /* fall through */
    }
  }
  // Last resort — leave tokens must hit the API host, not the SPA.
  return `http://localhost:${env.PORT}`;
}

export function clientAppOrigin(): string {
  return getEnv().CLIENT_URL.replace(/\/$/, '');
}

export function clientPortalUrl(path = '/client/dashboard'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${clientAppOrigin()}${p}`;
}

export function staffAppUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${clientAppOrigin()}${p}`;
}

export function mailCtaButton(href: string, label: string, bg = '#2563eb'): string {
  const safeHref = href.replace(/"/g, '&quot;');
  const safeLabel = label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<a href="${safeHref}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 18px;background:${bg};color:#ffffff;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;font-weight:600">${safeLabel}</a>`;
}

export function mailCtaRow(
  buttons: Array<{ href: string; label: string; bg?: string }>
): string {
  if (!buttons.length) return '';
  return `<p style="margin:20px 0 8px">${buttons
    .map((b) => mailCtaButton(b.href, b.label, b.bg))
    .join('')}</p>`;
}

/** CTA block for client data-request / document letters (portal + optional engagement). */
export function dataRequestMailButtonsHtml(opts: {
  engagementId?: string | null;
}): string {
  const buttons: Array<{ href: string; label: string; bg?: string }> = [
    { href: clientPortalUrl('/client/dashboard'), label: 'Open client portal', bg: '#2563eb' },
  ];
  if (opts.engagementId) {
    buttons.push({
      href: staffAppUrl(`/engagements/${opts.engagementId}`),
      label: 'View engagement',
      bg: '#0f766e',
    });
  }
  return mailCtaRow(buttons);
}
