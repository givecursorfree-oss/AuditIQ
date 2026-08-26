/**
 * ponytail: assert-style check for post-login attendance day gate.
 * Run: npx tsx client/src/lib/attendanceDayGate.selfcheck.ts
 */
import { attendanceDayState } from './attendanceDayGate.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(attendanceDayState(null) === 'none', 'null → none');
assert(attendanceDayState({}) === 'none', 'empty → none');
assert(attendanceDayState({ checkIn: '2026-08-25T06:21:00Z' }) === 'open', 'check-in only → open');
assert(
  attendanceDayState({
    checkIn: '2026-08-25T06:21:00Z',
    checkOut: '2026-08-25T06:24:00Z',
  }) === 'closed',
  'check-in+out → closed'
);

assert(
  attendanceDayState({
    checkIn: '2026-08-25T06:21:00Z',
    checkOut: '',
  }) === 'open',
  'empty checkOut → open (End day available)'
);
assert(
  attendanceDayState({
    checkIn: '2026-08-25T06:21:00Z',
    checkOut: null,
  }) === 'open',
  'null checkOut → open'
);

console.log('attendanceDayGate.selfcheck: ok');
