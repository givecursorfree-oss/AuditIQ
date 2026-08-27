/**
 * ponytail: one assert-style check for login attendance copy (no framework).
 * Run: npx tsx client/src/lib/attendanceLoginNotice.selfcheck.ts
 */
import {
  LocationNeededError,
  attendanceLoginNotice,
} from './attendanceLoginNotice.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const denied = attendanceLoginNotice(
  new LocationNeededError('denied', 'Location permission is off.')
);
assert(denied.title.includes('Attendance not marked'), 'denied title must indicate attendance status');
assert(
  /location|office/i.test(denied.message),
  'denied must tell how to fix'
);
assert(denied.variant === 'warning', 'denied is warning not login failure');

const coarse = attendanceLoginNotice(
  new LocationNeededError('unavailable', 'Location accuracy is ±3000m — too coarse to verify the office.')
);
assert(coarse.title.includes('Attendance not marked'), 'coarse title');
assert(/coarse|accuracy|office/i.test(coarse.message), 'coarse must mention accuracy');

const outside = attendanceLoginNotice(
  new Error('You are outside the office check-in area (M K Dandeker & Co LLP).')
);
assert(outside.title.includes('Attendance not marked'), 'outside title');
assert(outside.message.includes('outside the office check-in area'), 'outside message hides specific meters');
assert(outside.message.toLowerCase().includes('still use the app'), 'outside must separate login from attendance');

console.log('attendanceLoginNotice.selfcheck: ok');
