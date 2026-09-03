import { describe, expect, it } from 'vitest';
import { evaluateFoodLateSittingPolicy } from '../foodClaimPolicy.js';

describe('foodClaimPolicy', () => {
  it('flags weekday before 7 PM', () => {
    const d = new Date(2026, 5, 2); // Tue
    const flags = evaluateFoodLateSittingPolicy(d, '18:30');
    expect(flags.lateSittingException).toBe(true);
  });

  it('allows weekday at or after 7 PM', () => {
    const d = new Date(2026, 5, 2);
    expect(evaluateFoodLateSittingPolicy(d, '19:00').lateSittingException).toBeUndefined();
  });

  it('flags Saturday before 2 PM', () => {
    const d = new Date(2026, 5, 6); // Sat
    expect(evaluateFoodLateSittingPolicy(d, '13:00').lateSittingException).toBe(true);
  });

  it('flags Sunday always', () => {
    const d = new Date(2026, 5, 7);
    expect(evaluateFoodLateSittingPolicy(d, '20:00').lateSittingException).toBe(true);
  });
});
