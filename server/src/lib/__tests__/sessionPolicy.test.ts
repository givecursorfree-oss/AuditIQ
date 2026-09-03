import { describe, expect, it } from 'vitest';
import {
  assertSessionPolicy,
  isSessionAbsolutelyExpired,
  SESSION_ABSOLUTE_MS,
} from '../sessionPolicy.js';

describe('sessionPolicy', () => {
  it('marks sessions older than absolute max as expired', () => {
    const now = Date.UTC(2026, 0, 2, 12, 0, 0);
    const start = new Date(now - SESSION_ABSOLUTE_MS - 1000);
    expect(isSessionAbsolutelyExpired(start, now)).toBe(true);
  });

  it('keeps fresh sessions valid', () => {
    const now = Date.UTC(2026, 0, 2, 12, 0, 0);
    expect(isSessionAbsolutelyExpired(new Date(now - 60_000), now)).toBe(false);
    expect(isSessionAbsolutelyExpired(null, now)).toBe(false);
  });

  it('self-check passes', () => {
    expect(() => assertSessionPolicy()).not.toThrow();
  });
});
