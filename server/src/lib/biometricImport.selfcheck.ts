/**
 * Run: npx --yes tsx src/lib/biometricImport.selfcheck.ts
 */
import {
  elapsedClockMinutes,
  foldPersonName,
  istClockOnDate,
  minutesDiffClock,
  normalizeBioDate,
  normalizeClock,
  normalizeEmployeeCode,
  parseBiometricMatrix,
  reconcileAttendanceBio,
} from './biometricImport.js';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

assert(normalizeEmployeeCode('76') === '76', 'code');
assert(normalizeEmployeeCode('76.0') === '76', 'code float');
assert(normalizeClock('9:21') === '09:21', 'clock pad');
assert(normalizeClock('18:52') === '18:52', 'clock');
assert(normalizeClock('AB') === null, 'ab');
assert(normalizeBioDate('01/10/2026') === '2026-10-01', 'dmy');
assert(normalizeBioDate('2026-10-01') === '2026-10-01', 'iso');
assert(minutesDiffClock('10:00', '10:30') === 30, 'diff');
assert(foldPersonName('Pragadisan M') === foldPersonName('pragadisan m'), 'fold');

// Unusual device headings: Shift = Bio In, In = Bio Out, OT = reported hours
const unusual = [
  ['Organization-Wise Attendance from 01/10/2026 to 31/10/2026'],
  ['User ID', 'Name', 'Date', 'Shift', 'In', 'OT'],
  ['15', 'B MAHALINGAM', '01/10/2026', '18:52', '20:51', '1:59'],
  ['76', 'Pragadisan M', '01/10/2026', '10:12', '18:38', '8:26'],
];
const parsed = parseBiometricMatrix(unusual);
assert(parsed.length === 2, `expected 2 rows got ${parsed.length}`);
assert(parsed[0]!.employeeCode === '15', 'id 15');
assert(parsed[0]!.inTime === '18:52', `shift-as-in ${parsed[0]!.inTime}`);
assert(parsed[0]!.outTime === '20:51', `in-as-out ${parsed[0]!.outTime}`);
assert(parsed[0]!.workHrs === '1:59', 'ot');
assert(elapsedClockMinutes('18:52', '20:51') === 119, 'elapsed mahalingam');

const flat = parseBiometricMatrix([
  ['employeeCode', 'name', 'date', 'inTime', 'outTime', 'workHrs'],
  ['76', 'Pragadisan M', '2026-10-01', '10:12', '18:38', '8:26'],
]);
assert(flat[0]!.inTime === '10:12' && flat[0]!.outTime === '18:38', 'flat template');

const rec = reconcileAttendanceBio({
  appIn: '10:10',
  appOut: null,
  bioIn: '10:12',
  bioOut: '18:38',
  bioHrs: '8:26',
});
assert(rec.finalBasis === 'bio_out_suggested', rec.finalBasis);
assert(rec.validation === 'review', rec.validation);
assert(rec.finalOut === '18:38', rec.finalOut);

const applied = istClockOnDate('2026-10-01', '20:51', '18:52');
assert(applied.toISOString().includes('2026-10-01') || applied.toISOString().includes('2026-09-30'), 'ist clock');

console.log('biometricImport.selfcheck: ok');
