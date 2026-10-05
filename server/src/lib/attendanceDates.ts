/** Attendance calendar days use firm timezone (IST). */
export const ATTENDANCE_TIMEZONE = 'Asia/Kolkata';

/** YYYY-MM-DD in IST */
export function getAttendanceDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ATTENDANCE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Start/end of calendar day in IST as UTC Date objects */
export function getAttendanceDayRange(d = new Date()): { start: Date; end: Date } {
  const key = getAttendanceDateKey(d);
  return {
    start: new Date(`${key}T00:00:00+05:30`),
    end: new Date(`${key}T23:59:59.999+05:30`),
  };
}

export function attendanceDayFilter(d = new Date()) {
  const { start, end } = getAttendanceDayRange(d);
  return { gte: start, lte: end };
}

export function attendanceDayStart(d = new Date()): Date {
  return getAttendanceDayRange(d).start;
}

/** HH:mm in IST. Server local timezone must not be used for attendance clocks. */
export function formatIstHm(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ATTENDANCE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  let hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  if (hour === '24') hour = '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Instant shifted by N IST calendar days (noon anchor avoids DST edge cases). */
export function shiftAttendanceInstant(days: number, now = new Date()): Date {
  const key = shiftDateKey(getAttendanceDateKey(now), days);
  return new Date(`${key}T12:00:00+05:30`);
}

export function attendanceDayFilterDaysAgo(days: number, now = new Date()) {
  return attendanceDayFilter(shiftAttendanceInstant(-days, now));
}

/**
 * Resolve which attendance row End day / Out should use.
 * After IST midnight, prefer yesterday's still-open session so overnight work can check out.
 */
export function pickOpenAttendanceSession<T extends { checkIn: Date | null; checkOut: Date | null }>(
  today: T | null | undefined,
  yesterday: T | null | undefined
): { record: T; overnight: boolean } | null {
  if (yesterday?.checkIn && !yesterday.checkOut) {
    return { record: yesterday, overnight: true };
  }
  if (today?.checkIn && !today.checkOut) {
    return { record: today, overnight: false };
  }
  return null;
}

/**
 * Session shown on Attendance "Today" panel.
 * Overnight open yesterday wins so End day stays available past midnight.
 */
export function pickMeTodayAttendanceSession<T extends { checkIn: Date | null; checkOut: Date | null }>(
  today: T | null | undefined,
  yesterday: T | null | undefined
): { record: T; overnight: boolean } | null {
  const open = pickOpenAttendanceSession(today, yesterday);
  if (open) return open;
  if (today) return { record: today, overnight: false };
  return null;
}

/**
 * Resume after accidental End day: today if present, else yesterday closed after today's IST start
 * (ended past midnight), else yesterday still open.
 */
export function pickResumableAttendanceSession<
  T extends { checkIn: Date | null; checkOut: Date | null },
>(
  today: T | null | undefined,
  yesterday: T | null | undefined,
  now = new Date()
): { record: T; overnight: boolean } | null {
  if (today?.checkIn) {
    return { record: today, overnight: false };
  }
  const todayStart = attendanceDayStart(now);
  if (
    yesterday?.checkIn &&
    yesterday.checkOut &&
    yesterday.checkOut.getTime() >= todayStart.getTime()
  ) {
    return { record: yesterday, overnight: true };
  }
  if (yesterday?.checkIn && !yesterday.checkOut) {
    return { record: yesterday, overnight: true };
  }
  return null;
}

/** Today and the previous IST calendar day. */
export function entryDateWindow(now = new Date()): { min: string; max: string } {
  const max = getAttendanceDateKey(now);
  return { min: shiftDateKey(max, -1), max };
}

/** Date-only YYYY-MM-DD, or an instant, must fall on today or yesterday in IST. */
export function isEntryDateAllowed(raw: string, now = new Date()): boolean {
  let key = raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return false;
    key = getAttendanceDateKey(parsed);
  }
  const { min, max } = entryDateWindow(now);
  return key >= min && key <= max;
}
