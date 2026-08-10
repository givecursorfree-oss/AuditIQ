import { describe, expect, it } from 'vitest';
import { shareRecipientMatches } from '../shareAccess.js';

describe('shareRecipientMatches', () => {
  it('allows anyone when no recipient is set', () => {
    expect(shareRecipientMatches(null, undefined)).toBe(true);
    expect(shareRecipientMatches(undefined, 'a@b.com')).toBe(true);
  });

  it('requires a case-insensitive email match', () => {
    expect(shareRecipientMatches('A@Firm.com', 'a@firm.com')).toBe(true);
    expect(shareRecipientMatches('A@Firm.com', 'other@firm.com')).toBe(false);
    expect(shareRecipientMatches('A@Firm.com', undefined)).toBe(false);
  });
});
