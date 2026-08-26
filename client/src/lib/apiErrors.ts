import type { AxiosError } from 'axios';
import { resolveApiOrigin } from './apiBase';

type ApiErrorContext = 'login' | 'dashboard' | 'session' | 'generic';

function isAxiosError(err: unknown): err is AxiosError<{ error?: string }> {
  return typeof err === 'object' && err !== null && 'isAxiosError' in err;
}

export function isApiNetworkFailure(err: unknown): boolean {
  if (!isAxiosError(err)) return false;
  return (
    err.code === 'ERR_NETWORK' ||
    err.code === 'ECONNABORTED' ||
    err.message === 'Network Error' ||
    /timeout/i.test(err.message)
  );
}

/** Plain-language API errors (Krug: don't make me think). */
export function formatApiError(err: unknown, context: ApiErrorContext = 'generic'): string {
  if (isAxiosError(err)) {
    if (err.response?.status === 429) {
      return (
        err.response.data?.error ||
        'Too many requests. Wait about a minute, then try again.'
      );
    }
    if (err.response?.data?.error) {
      return err.response.data.error;
    }
    if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message)) {
      if (context === 'dashboard') {
        return 'Dashboard is taking too long to load. The API may be busy — wait a moment and tap Retry.';
      }
      if (context === 'session') {
        return 'Session check timed out. You can still sign in below.';
      }
      return 'The server took too long to respond. Wait a moment and try again.';
    }
    if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
      const api = resolveApiOrigin() || 'https://api.mkdandeker.com';
      const isProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
      if (!isProd) {
        return 'Cannot connect to the backend. Start the server on port 3001.';
      }
      if (context === 'login') {
        return `Cannot reach ${api}. If you just restarted the server, wait 30 seconds and try again.`;
      }
      return `Cannot reach ${api}. Check your internet connection, turn off VPN/WARP if enabled, then retry.`;
    }
  }

  if (err instanceof Error) {
    if (err.message.includes('HTML instead of JSON')) return err.message;
    return err.message;
  }

  return context === 'dashboard'
    ? 'Unable to load dashboard data. Check your connection and try again.'
    : 'Something went wrong. Please try again.';
}
