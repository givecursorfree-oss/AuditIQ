/**
 * Runnable check for article attendance leave formulas (HR Aug 2026).
 * Run: npx tsx src/lib/articleAttendancePolicy.selfcheck.ts
 */
import {
  classifyLateBand,
  lateLeaveDebitDays,
  totalAttendanceLeaveDebit,
  isNoAttendanceDay,
  PLACE_OFFICE,
  PLACE_CLIENT,
  ARTICLE_FIRM_LEAVE_DAYS,
  firmLeaveRemaining,
} from './articleAttendancePolicy.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Soft window: 10:06–10:35
assert(classifyLateBand(new Date('2026-04-01T10:05:00+05:30')) === 'on_time', '10:05 on_time');
assert(classifyLateBand(new Date('2026-04-01T10:06:00+05:30')) === 'soft_late', '10:06 soft');
assert(classifyLateBand(new Date('2026-04-01T10:35:00+05:30')) === 'soft_late', '10:35 soft');
assert(classifyLateBand(new Date('2026-04-01T10:36:00+05:30')) === 'hard_late', '10:36 hard');

// HR example: 15 soft lates → 2.5 days
assert(lateLeaveDebitDays(15, 0) === 2.5, '15 soft → 2.5');
assert(lateLeaveDebitDays(2, 0) === 0, '2 soft → 0');
assert(lateLeaveDebitDays(3, 0) === 0.5, '3 soft → 0.5');
assert(lateLeaveDebitDays(0, 1) === 0.5, '1 hard → 0.5');
assert(lateLeaveDebitDays(3, 2) === 1.5, '3 soft + 2 hard → 1.5');

assert(
  totalAttendanceLeaveDebit({ softLateCount: 15, hardLateCount: 0, noAttdCount: 1 }) === 3.5,
  '15 soft + 1 no-attd → 3.5'
);

assert(
  isNoAttendanceDay({
    placeOfWork: PLACE_OFFICE,
    hasCheckIn: true,
    bioPresent: true,
    hasTimesheet: false,
    forgiven: false,
  }),
  'office missing timesheet → no attd'
);
assert(
  !isNoAttendanceDay({
    placeOfWork: PLACE_OFFICE,
    hasCheckIn: true,
    bioPresent: true,
    hasTimesheet: true,
    forgiven: false,
  }),
  'office complete'
);
assert(
  isNoAttendanceDay({
    placeOfWork: PLACE_CLIENT,
    hasCheckIn: true,
    bioPresent: false,
    hasTimesheet: false,
    forgiven: false,
  }),
  'client missing bio → no attd'
);
assert(
  !isNoAttendanceDay({
    placeOfWork: PLACE_CLIENT,
    hasCheckIn: true,
    bioPresent: true,
    hasTimesheet: false,
    forgiven: false,
  }),
  'client: timesheet not required for no-attd rule'
);
assert(
  !isNoAttendanceDay({
    placeOfWork: PLACE_OFFICE,
    hasCheckIn: false,
    bioPresent: false,
    hasTimesheet: false,
    forgiven: true,
  }),
  'forgiven mail → not no-attd'
);
// Bio not synced yet: skip bio gate
assert(
  !isNoAttendanceDay({
    placeOfWork: PLACE_OFFICE,
    hasCheckIn: true,
    bioPresent: null,
    hasTimesheet: true,
    forgiven: false,
  }),
  'bio null + timesheet ok → present'
);

assert(ARTICLE_FIRM_LEAVE_DAYS === 24, '24 day credit');
assert(firmLeaveRemaining(24, 2, 2.5) === 19.5, 'remaining leave');

console.log('articleAttendancePolicy.selfcheck: ok');
