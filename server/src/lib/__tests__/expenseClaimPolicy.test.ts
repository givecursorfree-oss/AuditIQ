import { describe, expect, it } from 'vitest';
import { validateAmount, validatePartialAmount, isValidClaimType } from '../expenseClaimPolicy.js';

describe('expenseClaimPolicy', () => {
  it('validates claim types', () => {
    expect(isValidClaimType('food')).toBe(true);
    expect(isValidClaimType('travel')).toBe(true);
    expect(isValidClaimType('mileage')).toBe(false);
  });

  it('validates amounts', () => {
    expect(validateAmount(100)).toBeNull();
    expect(validateAmount(0)).toMatch(/greater than zero/);
  });

  it('validates partial approval amount', () => {
    expect(validatePartialAmount(500, 400)).toBeNull();
    expect(validatePartialAmount(500, 600)).toMatch(/exceed/);
  });
});
