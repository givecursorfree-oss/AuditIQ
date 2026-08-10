import crypto from 'crypto';

/**
 * Auth hardening helpers — token hashing, account lockout policy.
 *
 * Refresh / reset tokens are stored only as SHA-256 hashes so a database
 * leak cannot be replayed as a live session. Raw tokens exist only in the
 * httpOnly cookie (refresh) or the emailed link (reset).
 */

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MINUTES = 15;

export function generateToken(bytes = 40): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function isLocked(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
}

export function lockoutRemainingMinutes(user: { lockedUntil: Date | null }): number {
  if (!user.lockedUntil) return 0;
  return Math.max(0, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
}

/** Returns the update payload after a failed login attempt. */
export function failedAttemptUpdate(currentCount: number): {
  failedLoginCount: number;
  lockedUntil: Date | null;
} {
  const next = currentCount + 1;
  if (next >= LOCKOUT_THRESHOLD) {
    return {
      failedLoginCount: next,
      lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
    };
  }
  return { failedLoginCount: next, lockedUntil: null };
}

/** Mask a PAN for logs / audit details: AAAPL1234C → XXXXX1234C → keep last 4. */
export function maskPan(pan: string): string {
  if (pan.length <= 4) return pan;
  return '*'.repeat(pan.length - 4) + pan.slice(-4);
}

/** One-time portal-handoff JTIs. Bound in memory; 2-minute JWTs expire anyway. */
const usedHandoffJtis = new Set<string>();

export function consumeHandoffJti(jti: string): boolean {
  if (!jti || usedHandoffJtis.has(jti)) return false;
  usedHandoffJtis.add(jti);
  if (usedHandoffJtis.size > 5000) usedHandoffJtis.clear();
  return true;
}
