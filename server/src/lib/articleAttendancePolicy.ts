/**
 * MKD Article Assistant attendance policy (HR, Aug 2026).
 * Scope: Article Assistants only (has ArticleshipRecord).
 *
 * Source of truth: AuditIQ app check-in (replaces Google Attendance form).
 * Biometric is cross-verify only (bioPresent), not the primary mark.
 * Office GPS: device coordinates vs office pin (not Wi‑Fi/IP).
 *
 * Late:
 * - ≤10:05 on-time
 * - 10:06–10:35 soft late → every 3 instances = 0.5 day leave
 * - ≥10:36 hard late → 0.5 day leave each
 * No attendance (full day leave) unless same-month mail forgive:
 * - Office: app check-in + bio cross-check + timesheet
 * - Client Place: app check-in + bio cross-check
 * WFH: manager approval required before check-in.
 * Firm leave credit: 24 days / 2-year articleship.
 */
export const ARTICLE_FIRM_LEAVE_DAYS = 24;

export const PLACE_OFFICE = 'Office';
export const PLACE_CLIENT = 'Client Place';
export const PLACE_WFH = 'Work from Home';
export type PlaceOfWork = typeof PLACE_OFFICE | typeof PLACE_CLIENT | typeof PLACE_WFH;

export type LateBand = 'on_time' | 'soft_late' | 'hard_late';

/** Minutes from midnight IST. Soft = 10:06–10:35 inclusive; hard = after 10:35. */
export const SOFT_LATE_START_MIN = 10 * 60 + 6;
export const HARD_LATE_START_MIN = 10 * 60 + 36;

export function minutesSinceMidnightIst(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function classifyLateBand(checkIn: Date): LateBand {
  const m = minutesSinceMidnightIst(checkIn);
  if (m >= HARD_LATE_START_MIN) return 'hard_late';
  if (m >= SOFT_LATE_START_MIN) return 'soft_late';
  return 'on_time';
}

export function statusFromLateBand(band: LateBand): 'present' | 'late' {
  return band === 'on_time' ? 'present' : 'late';
}

/** Soft: floor(n/3)*0.5 ; Hard: n*0.5 */
export function lateLeaveDebitDays(softLateCount: number, hardLateCount: number): number {
  const softInstances = Math.floor(Math.max(0, softLateCount) / 3);
  return softInstances * 0.5 + Math.max(0, hardLateCount) * 0.5;
}

export type DayEvidence = {
  placeOfWork: PlaceOfWork | string | null;
  hasCheckIn: boolean;
  /** null = Bio not synced yet — skip bio gate (import pending). */
  bioPresent: boolean | null;
  hasTimesheet: boolean;
  forgiven: boolean;
};

/**
 * Full-day leave when required sources missing (and not forgiven).
 * Office: check-in + bio + timesheet. Client Place: check-in + bio.
 * WFH: check-in counts once manager-approved check-in exists; bio/timesheet not in HR “no attendance” list.
 */
export function isNoAttendanceDay(day: DayEvidence): boolean {
  if (day.forgiven) return false;
  if (!day.hasCheckIn) return true;

  const place = day.placeOfWork || PLACE_OFFICE;
  const bioOk = day.bioPresent === null || day.bioPresent === true;

  if (place === PLACE_CLIENT) {
    return !bioOk;
  }
  if (place === PLACE_WFH) {
    return false;
  }
  // Office (default)
  return !bioOk || !day.hasTimesheet;
}

export function noAttendanceLeaveDebitDays(noAttdCount: number): number {
  return Math.max(0, noAttdCount) * 1;
}

export function totalAttendanceLeaveDebit(args: {
  softLateCount: number;
  hardLateCount: number;
  noAttdCount: number;
}): number {
  return (
    lateLeaveDebitDays(args.softLateCount, args.hardLateCount) +
    noAttendanceLeaveDebitDays(args.noAttdCount)
  );
}

export function firmLeaveRemaining(allotted: number, usedFromLeaves: number, attendanceDebit: number): number {
  return allotted - usedFromLeaves - attendanceDebit;
}
