/**
 * Run: npx --yes tsx src/lib/leaveNotify.selfcheck.ts
 */
import { ARTICLE_LEAVE_RECIPIENTS, leaveRecipientsFor, MANAGER_LEAVE_RECIPIENTS } from './leaveNotify.js';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

const article = leaveRecipientsFor({ designation: 'Audit Executive (Article)' });
assert(article === ARTICLE_LEAVE_RECIPIENTS, 'article designation');
assert(leaveRecipientsFor({ hasArticleship: true }) === ARTICLE_LEAVE_RECIPIENTS, 'articleship record');
assert(
  leaveRecipientsFor({ hierarchyCode: 'SENIOR_AUDIT_EXECUTIVE' }) === MANAGER_LEAVE_RECIPIENTS,
  'senior audit executive'
);
assert(leaveRecipientsFor({ hierarchyCode: 'AUDIT_MANAGER' }) === MANAGER_LEAVE_RECIPIENTS, 'audit manager');
assert(leaveRecipientsFor({ designation: 'Sr. Audit Executive' }) === MANAGER_LEAVE_RECIPIENTS, 'sr title');
assert(leaveRecipientsFor({ hierarchyCode: 'PARTNER', designation: 'Partner' }) === null, 'partner has no list');
assert(
  leaveRecipientsFor({ hierarchyCode: 'SENIOR_AUDIT_MANAGER', hierarchyTitle: 'Senior Audit Manager' }) === null,
  'senior audit manager is not the audit-manager list'
);

console.log('leaveNotify.selfcheck: ok');
