import { describe, expect, it } from 'vitest';
import {
  attendanceDayFilter,
  entryDateWindow,
  getAttendanceDateKey,
  getAttendanceDayRange,
  isEntryDateAllowed,
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

  it('allows only today and yesterday in IST', () => {
    const now = new Date('2026-09-27T02:30:00+05:30');
    expect(entryDateWindow(now)).toEqual({ min: '2026-09-26', max: '2026-09-27' });
    expect(isEntryDateAllowed('2026-09-27', now)).toBe(true);
    expect(isEntryDateAllowed('2026-09-26', now)).toBe(true);
    expect(isEntryDateAllowed('2026-09-25', now)).toBe(false);
    expect(isEntryDateAllowed('2026-09-26T18:30:00.000Z', now)).toBe(true);
  });
});
