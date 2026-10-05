import { describe, expect, it } from 'vitest';
import {
  attendanceDayFilter,
  attendanceDayFilterDaysAgo,
  entryDateWindow,
  formatIstHm,
  getAttendanceDateKey,
  getAttendanceDayRange,
  isEntryDateAllowed,
  pickMeTodayAttendanceSession,
  pickOpenAttendanceSession,
  pickResumableAttendanceSession,
} from '../attendanceDates.js';

describe('attendanceDates', () => {
  it('formats an IST wall clock from a UTC instant', () => {
    expect(formatIstHm(new Date('2026-09-29T14:47:00.000Z'))).toBe('20:17');
    expect(formatIstHm(new Date('2026-09-29T05:02:00.000Z'))).toBe('10:32');
  });

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

  it('yesterday filter is the previous IST calendar day', () => {
    const now = new Date('2026-09-29T00:30:00+05:30');
    const today = attendanceDayFilter(now);
    const yesterday = attendanceDayFilterDaysAgo(1, now);
    expect(getAttendanceDateKey(today.gte)).toBe('2026-09-29');
    expect(getAttendanceDateKey(yesterday.gte)).toBe('2026-09-28');
  });
});

describe('overnight End day / Out Time', () => {
  const openY = {
    id: 'y',
    checkIn: new Date('2026-09-28T10:00:00+05:30'),
    checkOut: null as Date | null,
  };
  const closedToday = {
    id: 't',
    checkIn: new Date('2026-09-29T09:00:00+05:30'),
    checkOut: new Date('2026-09-29T18:00:00+05:30'),
  };

  it('picks yesterday open session after midnight for check-out', () => {
    const picked = pickOpenAttendanceSession(null, openY);
    expect(picked).toEqual({ record: openY, overnight: true });
  });

  it('prefers overnight open yesterday over a closed today row for me/today', () => {
    const picked = pickMeTodayAttendanceSession(closedToday, openY);
    expect(picked?.overnight).toBe(true);
    expect(picked?.record.id).toBe('y');
  });

  it('me/today falls back to today when yesterday is not open', () => {
    const picked = pickMeTodayAttendanceSession(closedToday, {
      ...openY,
      checkOut: new Date('2026-09-28T19:00:00+05:30'),
    });
    expect(picked).toEqual({ record: closedToday, overnight: false });
  });

  it('resume finds overnight session ended after IST midnight', () => {
    const now = new Date('2026-09-29T01:15:00+05:30');
    const yesterdayEndedPastMidnight = {
      id: 'y',
      checkIn: new Date('2026-09-28T10:00:00+05:30'),
      checkOut: new Date('2026-09-29T01:00:00+05:30'),
    };
    const picked = pickResumableAttendanceSession(null, yesterdayEndedPastMidnight, now);
    expect(picked?.overnight).toBe(true);
    expect(picked?.record.id).toBe('y');
  });

  it('resume ignores yesterday closed before midnight', () => {
    const now = new Date('2026-09-29T09:00:00+05:30');
    const yesterdayNormalClose = {
      id: 'y',
      checkIn: new Date('2026-09-28T10:00:00+05:30'),
      checkOut: new Date('2026-09-28T19:00:00+05:30'),
    };
    expect(pickResumableAttendanceSession(null, yesterdayNormalClose, now)).toBeNull();
  });
});
