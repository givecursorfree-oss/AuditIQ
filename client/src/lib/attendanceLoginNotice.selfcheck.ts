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
assert(denied.title.includes('Signed in'), 'denied title must say signed in');
assert(
  /precise location|phone|office/i.test(denied.message),
  'denied must tell how to fix'
);
assert(denied.variant === 'warning', 'denied is warning not login failure');

const coarse = attendanceLoginNotice(
  new LocationNeededError('unavailable', 'Got ±500m (likely Wi‑Fi, not GPS). Need within ±100m.')
);
assert(coarse.title.includes('Signed in'), 'coarse title');
assert(/GPS|phone|Wi/i.test(coarse.message), 'coarse must mention GPS/Wi‑Fi');

const outside = attendanceLoginNotice(
  new Error('You are 820m from M K Dandeker & Co LLP. Check-in is allowed within 500m of the office GPS pin.')
);
assert(outside.title.includes('office zone') || outside.title.includes('Outside'), 'outside title');
assert(outside.message.toLowerCase().includes('still use the app'), 'outside must separate login from attendance');

console.log('attendanceLoginNotice.selfcheck: ok');
