/**
 * ponytail: assert-based self-check for grade gates.
 */
import {
  canAttestTimesheets,
  canFirstLevelReview,
  canViewManagementInsights,
  GRADE,
} from './gradeCapabilities.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(canViewManagementInsights('Partner'), 'partner insights');
assert(canViewManagementInsights('Manager', GRADE.SENIOR_AUDIT_MANAGER), 'senior mgr insights');
assert(!canViewManagementInsights('Manager', GRADE.AUDIT_MANAGER), 'audit mgr no insights');
assert(canFirstLevelReview('Staff', GRADE.SENIOR_AUDIT_EXECUTIVE), 'sr exec review');
assert(!canFirstLevelReview('Staff', GRADE.AUDIT_EXECUTIVE), 'exec no first review');
assert(canAttestTimesheets('Manager'), 'mgr attest');
assert(canAttestTimesheets('Staff', GRADE.SENIOR_AUDIT_EXECUTIVE), 'sr exec attest');
assert(!canAttestTimesheets('Staff', GRADE.AUDIT_EXECUTIVE), 'exec no attest');

console.log('gradeCapabilities.selfcheck: ok');
