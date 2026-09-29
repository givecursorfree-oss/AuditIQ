import type { Response } from 'express';
import { getEnv, needsCrossSiteCookies } from './env.js';

const ACCESS_COOKIE = 'auditiq_token';
const REFRESH_COOKIE = 'auditiq_refresh';

/** Writes httpOnly access (+ optional refresh) cookies for the SPA. */
export function setTokensCookie(res: Response, accessToken: string, refreshToken?: string): void {
  const env = getEnv();
  const clientUrl = env.CLIENT_URL;
  const useSecure = clientUrl.startsWith('https://') || needsCrossSiteCookies(env);

  let sameSite: 'strict' | 'lax' | 'none' = 'lax';
  if (env.COOKIE_SAMESITE) {
    sameSite = env.COOKIE_SAMESITE;
  } else if (needsCrossSiteCookies(env)) {
    sameSite = 'none';
  } else {
    try {
      const host = new URL(clientUrl).hostname;
      if (useSecure && host.endsWith('.vercel.app')) sameSite = 'none';
    } catch {
      if (useSecure) sameSite = 'none';
    }
  }
  if (sameSite === 'none' && !useSecure) {
    sameSite = 'lax';
  }

  const domain =
    sameSite === 'none' ? undefined : env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {};

  const base = {
    httpOnly: true as const,
    secure: useSecure || sameSite === 'none',
    sameSite,
    ...domain,
  };

  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base,
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...base,
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
