import crypto from 'crypto';
import { getEnv } from './env.js';

const STATE_TTL_MS = 10 * 60 * 1000;

/** Signed OAuth state — survives server restarts (unlike in-memory maps). */
export function createGoogleOAuthState(userId: string, firmId: string): string {
  const payload = JSON.stringify({ userId, firmId, exp: Date.now() + STATE_TTL_MS });
  const data = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', getEnv().JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyGoogleOAuthState(state: string): { userId: string; firmId: string } | null {
  const dot = state.indexOf('.');
  if (dot <= 0) return null;

  const data = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = crypto.createHmac('sha256', getEnv().JWT_SECRET).update(data).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as {
      userId?: string;
      firmId?: string;
      exp?: number;
    };
    if (!payload.userId || !payload.firmId || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return { userId: payload.userId, firmId: payload.firmId };
  } catch {
    return null;
  }
}
