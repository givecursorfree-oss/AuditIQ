/**
 * ponytail: assert-based self-check for comp-off role gates (no test framework).
 */
import {
  canHrCreditCompOff,
  canManagerApproveCompOff,
  COMP_OFF_MANAGER_APPROVED,
  COMP_OFF_PENDING,
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
assert(COMP_OFF_PENDING === 'Pending', 'pending status');
assert(COMP_OFF_MANAGER_APPROVED === 'ManagerApproved', 'manager approved status');

console.log('compOffPolicy.selfcheck: ok');
