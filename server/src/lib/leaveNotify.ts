/** Leave-application mail lists. Submission only — approval mail is unchanged. */

export const ARTICLE_LEAVE_RECIPIENTS = [
  'shanmugam@mkdandeker.com',
  'pragadisan@mkdandeker.com',
  'nagajyothi@mkdandeker.com',
  'gopinathgp@mkdandeker.com',
  'senthilkumar@mkdandeker.com',
  'deepikat@mkdandeker.com',
  'nirmal@mkdandeker.com',
  'anandgupta@mkdandeker.com',
  'soundarya@mkdandeker.com',
  'dhara@mkdandeker.com',
] as const;

export const MANAGER_LEAVE_RECIPIENTS = [
  'poosaidurai@mkdandeker.com',
  'arunmehta@mkdandeker.com',
  'deepikat@mkdandeker.com',
  'nirmal@mkdandeker.com',
  'anandgupta@mkdandeker.com',
  'shanmugam@mkdandeker.com',
  'dhara@mkdandeker.com',
] as const;

export type LeaveApplicantGrade = {
  hierarchyCode?: string | null;
  hierarchyTitle?: string | null;
  designation?: string | null;
  hasArticleship?: boolean;
};

function textOf(applicant: LeaveApplicantGrade): string {
  return `${applicant.hierarchyTitle || ''} ${applicant.designation || ''}`.toLowerCase();
}

function isSeniorOrAuditManager(applicant: LeaveApplicantGrade): boolean {
  const code = applicant.hierarchyCode || '';
  if (code === 'SENIOR_AUDIT_EXECUTIVE' || code === 'AUDIT_MANAGER') return true;
  const text = textOf(applicant);
  if (/senior audit manager/.test(text)) return false;
  return /senior audit executive|sr\.?\s*audit executive/.test(text) || /\baudit manager\b/.test(text);
}

function isArticleAssistant(applicant: LeaveApplicantGrade): boolean {
  const code = applicant.hierarchyCode || '';
  if (code === 'AUDIT_EXECUTIVE' || code === 'INTERN') return true;
  if (applicant.hasArticleship) return true;
  return /article/.test(textOf(applicant));
}

/** Article assistants and senior executives / audit managers. Everyone else gets no list. */
export function leaveRecipientsFor(applicant: LeaveApplicantGrade): readonly string[] | null {
  if (isSeniorOrAuditManager(applicant)) return MANAGER_LEAVE_RECIPIENTS;
  if (isArticleAssistant(applicant)) return ARTICLE_LEAVE_RECIPIENTS;
  return null;
}
