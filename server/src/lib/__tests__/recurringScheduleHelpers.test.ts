import { describe, expect, it } from 'vitest';
import { computeNextCreateAt, scheduleMatchesDate } from '../recurringScheduleHelpers.js';

describe('recurringScheduleHelpers', () => {
  const monthlySchedule = {
    isActive: true,
    frequency: 'monthly',
    triggerDay: 15,
    triggerDates: null,
    triggerMonth: null,
    autoCreateStartDate: new Date('2025-01-01'),
    autoCreateEndDate: null,
  };

  it('matches monthly schedule on trigger day', () => {
    const d = new Date('2025-06-15T12:00:00');
    expect(scheduleMatchesDate(monthlySchedule, d)).toBe(true);
    expect(scheduleMatchesDate(monthlySchedule, new Date('2025-06-14T12:00:00'))).toBe(false);
  });

  it('respects autoCreateStartDate', () => {
    expect(scheduleMatchesDate(monthlySchedule, new Date('2024-12-15'))).toBe(false);
  });

  it('computes next create date after today', () => {
    const from = new Date('2025-06-10');
    const next = computeNextCreateAt(monthlySchedule, from);
    expect(next?.getDate()).toBe(15);
    expect(next?.getMonth()).toBe(5);
  });

  it('returns null when schedule is inactive', () => {
    expect(computeNextCreateAt({ ...monthlySchedule, isActive: false })).toBeNull();
  });
});
