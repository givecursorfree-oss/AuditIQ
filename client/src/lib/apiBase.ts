/**
 * API origin for axios + Socket.IO.
 * - Same-origin (VPS nginx): leave VITE_API_URL unset → `/api` + current origin for sockets
 * - Vercel split: set VITE_API_URL=https://api.auditiq.mkdandeker.com (no trailing slash)
 */
export function resolveApiOrigin(): string {
  const raw = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (raw) return raw;
  if (typeof window !== 'undefined' && window.location.origin.includes('localhost:5173')) {
    return 'http://localhost:3001';
  }
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** Axios baseURL — always ends with `/api` */
export function resolveApiBaseUrl(): string {
  const origin = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
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
