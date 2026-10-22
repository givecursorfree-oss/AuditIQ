/**
 * ponytail: assert-based self-check for comp-off role gates (no test framework).
 */
import {
  canHrCreditCompOff,
  canManagerApproveCompOff,
  COMP_OFF_MANAGER_APPROVED,
  COMP_OFF_PENDING,
  DEFAULT_COMP_OFF_DAYS,
} from './compOffPolicy.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(canManagerApproveCompOff('Manager'), 'Manager can approve');
assert(canManagerApproveCompOff('Partner'), 'Partner can approve');
assert(!canManagerApproveCompOff('HR'), 'HR is not manager-approve step');
assert(!canManagerApproveCompOff('Staff'), 'Staff cannot approve');
assert(canHrCreditCompOff('HR'), 'HR can credit');
assert(canHrCreditCompOff('Partner'), 'Partner can credit');
assert(!canHrCreditCompOff('Manager'), 'Manager cannot HR-credit');

/** Half-day request maps to 0.5 credit days. */
function resolveCompOffDays(input: { halfDay?: boolean; days?: number }, fallback = DEFAULT_COMP_OFF_DAYS): number {
  if (input.halfDay) return 0.5;
  return input.days ?? fallback;
}
assert(resolveCompOffDays({ halfDay: true }) === 0.5, 'half day');
assert(resolveCompOffDays({ days: 1 }) === 1, 'full day');
assert(resolveCompOffDays({}) === DEFAULT_COMP_OFF_DAYS, 'default days');
assert(COMP_OFF_PENDING === 'Pending', 'pending status');
assert(COMP_OFF_MANAGER_APPROVED === 'ManagerApproved', 'manager approved status');

console.log('compOffPolicy.selfcheck: ok');
