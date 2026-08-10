import { describe, expect, it } from 'vitest';
import { optionalEmail, optionalString } from '../zodHelpers.js';

describe('zodHelpers', () => {
  it('optionalEmail accepts empty string', () => {
    expect(optionalEmail.parse('')).toBeUndefined();
  });

  it('optionalEmail accepts valid email', () => {
    expect(optionalEmail.parse('firm@example.com')).toBe('firm@example.com');
  });

  it('optionalEmail rejects invalid email', () => {
    expect(() => optionalEmail.parse('not-an-email')).toThrow();
  });

  it('optionalString treats empty as undefined', () => {
    expect(optionalString.parse('')).toBeUndefined();
    expect(optionalString.parse('MKD')).toBe('MKD');
  });
});
