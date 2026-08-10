import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../emailNormalize.js';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Client@Example.COM  ')).toBe('client@example.com');
  });
});
