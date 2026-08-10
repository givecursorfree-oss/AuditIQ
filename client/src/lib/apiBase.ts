/**
 * API origin for axios + Socket.IO.
 * - Same-origin (VPS nginx): leave VITE_API_URL unset → `/api` + current origin for sockets
 * - Vercel split: set VITE_API_URL=https://api.mkdandeker.com (no trailing slash)
 *   (also shipped via client/.env.production for Vercel builds)
 */
function configuredApiOrigin(): string {
  return (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
}

export function resolveApiOrigin(): string {
  const raw = configuredApiOrigin();
  if (raw) return raw;
  if (typeof window !== 'undefined' && window.location.origin.includes('localhost:5173')) {
    return 'http://localhost:3001';
  }
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** Axios baseURL — always ends with `/api` */
export function resolveApiBaseUrl(): string {
  const origin = configuredApiOrigin();
  if (origin) return `${origin}/api`;
  return '/api';
}

/** Absolute URL for window.open / <a href> downloads that need cookies */
export function apiAbsoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const origin = resolveApiOrigin();
  if (!origin || origin === (typeof window !== 'undefined' ? window.location.origin : '')) {
    return p.startsWith('/api') ? p : `/api${p}`;
  }
  return p.startsWith('/api') ? `${origin}${p}` : `${origin}/api${p}`;
}

/** True when a response body looks like the Vite SPA index (Vercel rewrite miss). */
export function looksLikeSpaHtml(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  const s = data.slice(0, 200).toLowerCase();
  return s.includes('<!doctype html') || s.includes('<html');
}
