/**
 * Session lifetime policy (auth cookies + idle UI).
 * Access JWT stays 15m; refresh cookie 7d — absolute/idle tighten that.
 */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_IDLE_WARN_MS = 2 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export function isSessionAbsolutelyExpired(sessionStartedAt: Date | string | number | null | undefined, now = Date.now()): boolean {
  if (sessionStartedAt == null) return false;
  const start = typeof sessionStartedAt === 'number' ? sessionStartedAt : new Date(sessionStartedAt).getTime();
  if (!Number.isFinite(start)) return false;
  return now - start >= SESSION_ABSOLUTE_MS;
}

// ponytail: one assert-level check — fails in tests/node if math regresses
export function assertSessionPolicy(): void {
  const start = Date.now() - SESSION_ABSOLUTE_MS - 1;
  if (!isSessionAbsolutelyExpired(start)) {
    throw new Error('session absolute expiry check failed');
  }
  if (isSessionAbsolutelyExpired(Date.now())) {
    throw new Error('fresh session must not be expired');
  }
}
