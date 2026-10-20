/**
 * Run: npx --yes tsx src/lib/leaveNotify.selfcheck.ts
 */
import {
  ARTICLE_LEAVE_RECIPIENTS,
  FINAL_LEAVE_APPROVER_EMAILS,
  isFinalLeaveApproverEmail,
  leaveRecipientsFor,
  MANAGER_LEAVE_RECIPIENTS,
} from './leaveNotify.js';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

assert(MANAGER_LEAVE_RECIPIENTS.length === 7, 'manager list size');
assert(MANAGER_LEAVE_RECIPIENTS.includes('arunmehta@mkdandeker.com'), 'arunmehta');
assert(MANAGER_LEAVE_RECIPIENTS.includes('poosaidurai@mkdandeker.com'), 'poosaidurai');
assert(MANAGER_LEAVE_RECIPIENTS.includes('shanmugam@mkdandeker.com'), 'shanmugam');
assert(MANAGER_LEAVE_RECIPIENTS.includes('dhara@mkdandeker.com'), 'dhara');
assert(MANAGER_LEAVE_RECIPIENTS.includes('deepikat@mkdandeker.com'), 'deepikat');
assert(MANAGER_LEAVE_RECIPIENTS.includes('nirmal@mkdandeker.com'), 'nirmal');
assert(MANAGER_LEAVE_RECIPIENTS.includes('anandgupta@mkdandeker.com'), 'anandgupta');
assert(FINAL_LEAVE_APPROVER_EMAILS === MANAGER_LEAVE_RECIPIENTS, 'alias');

const article = leaveRecipientsFor({ designation: 'Audit Executive (Article)' });
assert(article === ARTICLE_LEAVE_RECIPIENTS, 'article designation');
assert(leaveRecipientsFor({ hasArticleship: true }) === ARTICLE_LEAVE_RECIPIENTS, 'articleship record');
assert(
  leaveRecipientsFor({ hierarchyCode: 'SENIOR_AUDIT_EXECUTIVE' }) === MANAGER_LEAVE_RECIPIENTS,
  'senior audit executive'
);
assert(leaveRecipientsFor({ hierarchyCode: 'AUDIT_MANAGER' }) === MANAGER_LEAVE_RECIPIENTS, 'audit manager');
assert(leaveRecipientsFor({ designation: 'Sr. Audit Executive' }) === MANAGER_LEAVE_RECIPIENTS, 'sr title');
assert(leaveRecipientsFor({ role: 'Staff' }) === MANAGER_LEAVE_RECIPIENTS, 'staff role');
assert(leaveRecipientsFor({ hierarchyCode: 'PARTNER', designation: 'Partner' }) === null, 'partner has no list');
assert(
  leaveRecipientsFor({ hierarchyCode: 'SENIOR_AUDIT_MANAGER', hierarchyTitle: 'Senior Audit Manager' }) === null,
  'senior audit manager is not the audit-manager list'
);
assert(isFinalLeaveApproverEmail('ArunMehta@mkdandeker.com'), 'email normalize');
assert(isFinalLeaveApproverEmail('deepikat@mkdandeker.com'), 'deepikat is final');
assert(!isFinalLeaveApproverEmail('soundarya@mkdandeker.com'), 'article-only not final');

console.log('leaveNotify.selfcheck: ok');
