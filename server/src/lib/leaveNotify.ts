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

/** Final leave sanctioners for Audit Manager / Sr Audit Executive / Staff. */
export const FINAL_LEAVE_APPROVER_EMAILS = [
  'arunmehta@mkdandeker.com',
  'poosaidurai@mkdandeker.com',
] as const;

/** @deprecated alias — same as FINAL_LEAVE_APPROVER_EMAILS */
export const MANAGER_LEAVE_RECIPIENTS = FINAL_LEAVE_APPROVER_EMAILS;

export type LeaveApplicantGrade = {
  hierarchyCode?: string | null;
  hierarchyTitle?: string | null;
  designation?: string | null;
  hasArticleship?: boolean;
  role?: string | null;
};

export function normalizeLeaveEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isFinalLeaveApproverEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = normalizeLeaveEmail(email);
  return (FINAL_LEAVE_APPROVER_EMAILS as readonly string[]).includes(e);
}

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

export function isArticleAssistant(applicant: LeaveApplicantGrade): boolean {
  const code = applicant.hierarchyCode || '';
  if (code === 'AUDIT_EXECUTIVE' || code === 'INTERN') return true;
  if (applicant.hasArticleship) return true;
  return /article/.test(textOf(applicant));
}

/** Audit Manager / Sr AE → two partners. Article assistants → article list. Other Staff → two partners. */
export function leaveRecipientsFor(applicant: LeaveApplicantGrade): readonly string[] | null {
  if (isSeniorOrAuditManager(applicant)) return MANAGER_LEAVE_RECIPIENTS;
  if (isArticleAssistant(applicant)) return ARTICLE_LEAVE_RECIPIENTS;
  if (applicant.role === 'Staff') return MANAGER_LEAVE_RECIPIENTS;
  return null;
}
