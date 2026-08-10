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
