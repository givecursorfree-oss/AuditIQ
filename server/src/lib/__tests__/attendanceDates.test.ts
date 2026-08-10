import { describe, expect, it } from 'vitest';
import {
  attendanceDayFilter,
  getAttendanceDateKey,
  getAttendanceDayRange,
} from '../attendanceDates.js';

describe('attendanceDates', () => {
  it('formats IST date key', () => {
    const key = getAttendanceDateKey(new Date('2026-06-04T10:00:00+05:30'));
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('day range contains IST midnight record', () => {
    const { start, end } = getAttendanceDayRange(new Date('2026-06-04T12:00:00+05:30'));
    const filter = attendanceDayFilter(new Date('2026-06-04T12:00:00+05:30'));
    expect(filter.gte.getTime()).toBe(start.getTime());
    expect(filter.lte.getTime()).toBe(end.getTime());
    expect(start.toISOString()).toBe('2026-06-03T18:30:00.000Z');
  });
});
