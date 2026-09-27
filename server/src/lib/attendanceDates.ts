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

function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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
