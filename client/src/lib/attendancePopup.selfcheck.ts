/**
 * ponytail: login attendance eligibility covers all firm staff roles.
 * Run: npx tsx client/src/lib/attendancePopup.selfcheck.ts
 */
import { isAttendanceEligible } from './attendancePopup.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

for (const role of ['Partner', 'Admin', 'Manager', 'Staff', 'Intern', 'HR', 'Accounts']) {
  assert(isAttendanceEligible(role), `${role} must get post-login attendance`);
}
assert(!isAttendanceEligible('Client'), 'Client portal must not get attendance toast');

console.log('attendancePopup.selfcheck: ok');
