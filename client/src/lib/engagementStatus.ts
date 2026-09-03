/** Unified engagement / letter status labels for filters, badges, and timelines. */

const ENGAGEMENT_STATUS_LABELS: Record<string, string> = {
  Planning: 'Planning',
  Fieldwork: 'Fieldwork',
  Review: 'Review',
  'Under Review': 'Under Review',
  Reporting: 'Reporting',
  Closed: 'Closed',
  Active: 'Active',
  'On Hold': 'On Hold',
  Completed: 'Completed',
  Archived: 'Archived',
};

const LETTER_STATUS_LABELS: Record<string, string> = {
  not_required: 'Not required',
  draft: 'Draft — editable',
  sent: 'Sent — awaiting client signature',
  signed: 'Signed by client',
  rejected: 'Rejected',
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  awaiting_letter_signature: 'Awaiting letter signature',
};

export function formatEngagementStatus(status: string): string {
  return ENGAGEMENT_STATUS_LABELS[status] ?? status;
}

export function formatLetterStatus(status: string): string {
  return LETTER_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export function formatRequestStatus(status: string): string {
  return REQUEST_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export type StatusBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

/** Human-readable engagement count — never "engagement(s)". */
export function pluralizeEngagements(count: number): string {
  return count === 1 ? '1 engagement' : `${count} engagements`;
}

/** Primary approve CTA — consistent on list, detail, and confirm dialogs. */
export function approveCreateButtonLabel(count: number, loading = false): string {
  if (loading) return 'Approving…';
  return count === 1
    ? 'Approve & create 1 engagement'
    : `Approve & create ${count} engagements`;
}

export function approveConfirmMessage(clientName: string, count: number): string {
  return `Create ${pluralizeEngagements(count)} for ${clientName}? Next: generate and send the engagement letter before team assignment.`;
}

export function requestStatusBadgeVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'approved':
    case 'awaiting_letter_signature':
      return 'secondary';
    case 'rejected':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function letterStatusBadgeVariant(letterStatus: string): StatusBadgeVariant {
  switch (letterStatus) {
    case 'signed':
      return 'success';
    case 'sent':
      return 'warning';
    case 'rejected':
      return 'destructive';
    case 'draft':
      return 'secondary';
    case 'not_required':
    default:
      return 'outline';
  }
}

export type LetterWorkflowContext = {
  requestStatus: string;
  letterStatus: string;
  hasEngagement: boolean;
};

/**
 * Letter workflow status for stepper + badges — avoids "Not required" while request is still pending.
 */
export function resolveLetterWorkflowDisplay(ctx: LetterWorkflowContext): {
  label: string;
  badgeVariant: StatusBadgeVariant;
} {
  const { requestStatus, letterStatus, hasEngagement } = ctx;

  if (requestStatus === 'rejected') {
    return { label: 'Request rejected', badgeVariant: 'destructive' };
  }
  if (requestStatus === 'pending' || !hasEngagement) {
    return { label: 'Awaiting approval', badgeVariant: 'warning' };
  }

  switch (letterStatus) {
    case 'draft':
      return { label: formatLetterStatus('draft'), badgeVariant: 'secondary' };
    case 'sent':
      return { label: formatLetterStatus('sent'), badgeVariant: 'warning' };
    case 'signed':
      return { label: formatLetterStatus('signed'), badgeVariant: 'success' };
    case 'rejected':
      return { label: formatLetterStatus('rejected'), badgeVariant: 'destructive' };
    case 'not_required':
    default:
      return { label: 'Ready to generate letter', badgeVariant: 'secondary' };
  }
}

/** Dashboard engagements table row status */
export type DashboardEngagementRowStatus = 'in_progress' | 'completed' | 'on_hold';

export function dashboardEngagementRowDisplay(status: DashboardEngagementRowStatus): {
  label: string;
  badgeVariant: StatusBadgeVariant;
} {
  switch (status) {
    case 'completed':
      return { label: 'Completed', badgeVariant: 'success' };
    case 'on_hold':
      return { label: 'On hold', badgeVariant: 'warning' };
    case 'in_progress':
    default:
      return { label: 'In progress', badgeVariant: 'success' };
  }
}

/** Legacy engagement list statuses (Planning, Fieldwork, Review, etc.) */
export function engagementLifecycleBadgeVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case 'Planning':
    case 'Fieldwork':
    case 'Active':
      return 'success';
    case 'Review':
    case 'Under Review':
    case 'Reporting':
    case 'On Hold':
      return 'warning';
    case 'Completed':
    case 'Closed':
      return 'success';
    case 'Archived':
      return 'outline';
    default:
      return 'secondary';
  }
}

/** Sign-off, leave, workpaper, report approval states */
export function approvalStatusBadgeVariant(status: string): StatusBadgeVariant {
  // Normalize camelCase (ManagerApproved) and snake/space forms
  const s = status
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .trim();
  if (
    s === 'approved' ||
    s === 'final' ||
    s === 'verified' ||
    s === 'received' ||
    s === 'paid' ||
    s === 'hr credited' ||
    s === 'submitted'
  ) {
    return 'success';
  }
  if (s === 'rejected' || s === 'critical') return 'destructive';
  if (s === 'cancelled') return 'outline';
  if (
    s === 'pending' ||
    s === 'draft' ||
    s === 'under review' ||
    s === 'prepared' ||
    s === 'in progress' ||
    s === 'manager approved' ||
    s === 'reviewed'
  ) {
    return 'warning';
  }
  return 'secondary';
}

export function formatApprovalStatus(status: string): string {
  return status;
}

/** Generic workflow approval requests (PENDING, IN_PROGRESS, etc.) */
export function workflowApprovalStatusBadgeVariant(status: string): StatusBadgeVariant {
  switch (status.toUpperCase().replace(/ /g, '_')) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'destructive';
    case 'CANCELLED':
      return 'outline';
    case 'PENDING':
    case 'IN_PROGRESS':
      return 'warning';
    default:
      return 'secondary';
  }
}

export function formatWorkflowApprovalStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function priorityBadgeVariant(priority: string): StatusBadgeVariant {
  switch (priority.toUpperCase()) {
    case 'LOW':
      return 'outline';
    case 'MEDIUM':
      return 'secondary';
    case 'HIGH':
      return 'warning';
    case 'URGENT':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function formatPriority(priority: string): string {
  if (!priority) return priority;
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}
