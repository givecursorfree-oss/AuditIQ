import { describe, expect, it } from 'vitest';
import { consumeHandoffJti } from '../authSecurity.js';

describe('consumeHandoffJti', () => {
  it('accepts a jti once and rejects replay', () => {
    const jti = `jti-${Date.now()}-${Math.random()}`;
    expect(consumeHandoffJti(jti)).toBe(true);
    expect(consumeHandoffJti(jti)).toBe(false);
  });

  it('rejects empty jti', () => {
    expect(consumeHandoffJti('')).toBe(false);
  });
});
