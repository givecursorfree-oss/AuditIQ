export const CLAIM_TYPE_LABELS: Record<string, string> = {
  food: 'Food',
  travel: 'Travel',
};

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Pending',
  approved: 'Accepted',
  partially_approved: 'Partial',
  rejected: 'Rejected',
};

export const OCR_STATUS_LABELS: Record<string, string> = {
  pending: 'OCR pending',
  completed: 'OCR done',
  failed: 'OCR failed',
};

export const MANAGER_APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Accepted',
  partially_approved: 'Limited',
  rejected: 'Rejected',
};

export const PROCESSING_STATUS_LABELS: Record<string, string> = {
  unprocessed: 'Unprocessed',
  in_batch: 'In batch',
  partner_approved: 'Partner approved',
  accounts_approved: 'Accounts approved',
  paid: 'Paid',
};

export const BATCH_STATUS_LABELS: Record<string, string> = {
  draft: 'Sent', // legacy
  sent: 'Sent',
  partner_approved: 'Approved',
  accounts_approved: 'Approved (accounts)',
  paid: 'Paid',
  rejected: 'Rejected',
};

/** Spec history buckets: Sent | Pending Approval | Approved */
export type BatchHistoryFilter = 'sent' | 'pending_approval' | 'approved' | 'rejected' | 'all';

export const BATCH_HISTORY_FILTERS: { id: BatchHistoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sent', label: 'Sent' },
  { id: 'pending_approval', label: 'Pending Approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

export function normalizeBatchStatus(status: string): string {
  return status === 'draft' ? 'sent' : status;
}

export function isBatchAwaitingPartner(status: string): boolean {
  const s = normalizeBatchStatus(status);
  return s === 'sent';
}

export function batchMatchesHistoryFilter(status: string, filter: BatchHistoryFilter): boolean {
  const s = normalizeBatchStatus(status);
  if (filter === 'all') return true;
  if (filter === 'sent' || filter === 'pending_approval') return s === 'sent';
  if (filter === 'approved') return s === 'partner_approved' || s === 'accounts_approved' || s === 'paid';
  if (filter === 'rejected') return s === 'rejected';
  return true;
}

/** Primary + secondary labels for a batch row (Sent · Pending Approval). */
export function batchStatusDisplay(status: string): { primary: string; secondary?: string } {
  const s = normalizeBatchStatus(status);
  if (s === 'sent') return { primary: 'Sent', secondary: 'Pending Approval' };
  if (s === 'partner_approved') return { primary: 'Approved', secondary: 'Partner' };
  if (s === 'accounts_approved') return { primary: 'Approved', secondary: 'Accounts' };
  if (s === 'paid') return { primary: 'Paid' };
  if (s === 'rejected') return { primary: 'Rejected' };
  return { primary: BATCH_STATUS_LABELS[status] ?? status };
}

export function batchRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function claimDetailPath(claimId: string): string {
  return `/claims/detail/${claimId}`;
}

export const TRAVEL_MODE_LABELS: Record<string, string> = {
  cab: 'Rapido / Uber / Other Cab',
  own_vehicle: 'Own Vehicle',
};

export interface ClaimEngagementRef {
  id: string;
  title: string;
  serviceCode?: string | null;
  financialYear?: string | null;
  type?: string | null;
}

export interface ClaimParticipantRow {
  id: string;
  amountShare: string | number;
  user: { id: string; firstName: string; lastName: string };
  engagement?: ClaimEngagementRef | null;
  client?: { id: string; name: string } | null;
  workType?: string | null;
}

export interface ClaimManagerApprovalRow {
  id: string;
  status: string;
  teamAmount: string | number;
  approvedAmount?: string | number | null;
  manager: { id: string; firstName: string; lastName: string };
}

export interface StaffClaimRow {
  id: string;
  claimType: string;
  expenseDate: string;
  submittedAt?: string;
  amount: string | number;
  approvedAmount?: string | number | null;
  workType?: string | null;
  workTypeOther?: string | null;
  description?: string | null;
  travelTime?: string | null;
  jurisdiction?: string | null;
  centreState?: string | null;
  location?: string | null;
  mapLink?: string | null;
  visitedById?: string | null;
  visitedBy?: { id: string; firstName: string; lastName: string } | null;
  period?: string | null;
  issue?: string | null;
  replyFromDepartment?: string | null;
  travelMode?: string | null;
  claimStatus: string;
  processingStatus: string;
  participantCount?: number;
  ocrDetectedAmount?: string | number | null;
  ocrStatus?: string;
  policyFlags?: {
    lateSittingException?: boolean;
    lateSittingReason?: string;
    computerLogoffTime?: string | null;
    fingerprintLogoffTime?: string | null;
    logoffMismatch?: boolean;
    logoffMismatchReason?: string | null;
  } | null;
  staff: { firstName: string; lastName: string };
  expensePayer?: { id: string; firstName: string; lastName: string } | null;
  client?: { id: string; name: string } | null;
  engagement?: ClaimEngagementRef | null;
  batchId?: string | null;
  receipts: { id: string; fileName: string; mimeType?: string | null }[];
  participants?: ClaimParticipantRow[];
  managerApprovals?: ClaimManagerApprovalRow[];
}

/** Accept disabled when cab/food lacks receipt; own_vehicle travel may have none. */
export function claimHasRequiredProof(claim: Pick<StaffClaimRow, 'claimType' | 'travelMode' | 'receipts'>): boolean {
  if (claim.claimType === 'travel' && claim.travelMode === 'own_vehicle') return true;
  return (claim.receipts?.length ?? 0) > 0;
}

export function formatInr(amount: string | number): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

export function receiptDownloadUrl(receiptId: string): string {
  return `/expense-claims/receipts/${receiptId}/download`;
}

export function claimTypePrefix(type: string): string {
  return type === 'travel' ? 'T' : 'F';
}

export function perPersonShare(amount: string | number, count: number): number {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!count || count <= 1) return n;
  return Math.round((n / count) * 100) / 100;
}

export function staffName(u: { firstName: string; lastName: string }): string {
  return `${u.firstName} ${u.lastName}`.trim();
}

export function claimAmount(amount: string | number): number {
  return typeof amount === 'string' ? parseFloat(amount) : amount;
}

/** True when OCR total differs from claimed amount by more than ₹1. */
export function ocrAmountMismatch(claimed: string | number, ocr: string | number | null | undefined): boolean {
  if (ocr == null) return false;
  return Math.abs(claimAmount(claimed) - claimAmount(ocr)) > 1;
}

export function claimPolicyFlagLines(
  flags: StaffClaimRow['policyFlags'] | null | undefined
): string[] {
  if (!flags) return [];
  const lines: string[] = [];
  if (flags.lateSittingException) {
    lines.push(flags.lateSittingReason ? `Late sitting: ${flags.lateSittingReason}` : 'Late sitting exception');
  }
  if (flags.logoffMismatch) {
    lines.push(flags.logoffMismatchReason ? `Logoff: ${flags.logoffMismatchReason}` : 'Logoff mismatch');
  }
  if (flags.computerLogoffTime) {
    lines.push(`Computer logoff: ${flags.computerLogoffTime}`);
  }
  if (flags.fingerprintLogoffTime) {
    lines.push(`Biometric logoff: ${flags.fingerprintLogoffTime}`);
  }
  return lines;
}

export function claimStatusBadgeVariant(
  status: string
): 'outline' | 'success' | 'destructive' | 'warning' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'destructive';
  if (status === 'partially_approved') return 'warning';
  return 'outline';
}

export function managerApprovalBadgeVariant(
  status: string
): 'outline' | 'success' | 'destructive' | 'warning' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'destructive';
  if (status === 'partially_approved') return 'warning';
  return 'outline';
}

export type ClaimProgressStepState = 'completed' | 'active' | 'inactive' | 'failed';

export type ClaimProgressStep = {
  key: string;
  label: string;
  state: ClaimProgressStepState;
};

export function engagementCode(eng?: ClaimEngagementRef | null): string {
  if (!eng) return '—';
  if (eng.serviceCode) return eng.serviceCode;
  return eng.id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function engagementHeaderLine(claim: StaffClaimRow): string {
  const eng = claim.engagement ?? claim.participants?.[0]?.engagement;
  const client = claim.client?.name ?? claim.participants?.[0]?.client?.name ?? '—';
  const code = engagementCode(eng);
  const fy = eng?.financialYear ? ` · FY ${eng.financialYear}` : '';
  const title = eng?.title ?? '—';
  return `${code}${fy} · ${client} · ${title}`;
}

export function claimSliderStep(max: number): number {
  if (max <= 500) return 50;
  if (max <= 2000) return 100;
  return 250;
}

export function percentOfClaimed(part: number, total: string | number): number {
  const t = claimAmount(total);
  if (!t) return 0;
  return Math.round((part / t) * 100);
}

export function ocrMarkerPercent(ocr: string | number | null | undefined, max: number): number | null {
  if (ocr == null || !max) return null;
  return Math.min(100, Math.max(0, (claimAmount(ocr) / max) * 100));
}

export function claimProgressSteps(claim: StaffClaimRow): ClaimProgressStep[] {
  const ocrStatus = claim.ocrStatus ?? 'pending';
  const stillWaitingManagers = (claim.managerApprovals ?? []).some((a) => a.status === 'pending');
  const managerPending =
    claim.claimStatus === 'pending_approval' ||
    (claim.claimStatus === 'partially_approved' && stillWaitingManagers);
  const managerResolved =
    claim.claimStatus === 'approved' ||
    claim.claimStatus === 'rejected' ||
    (claim.claimStatus === 'partially_approved' && !stillWaitingManagers);
  const paid = claim.processingStatus === 'paid';
  const payable = claim.claimStatus === 'approved' || claim.claimStatus === 'partially_approved';

  let ocrState: ClaimProgressStepState = 'inactive';
  if (ocrStatus === 'failed') ocrState = 'failed';
  else if (ocrStatus === 'completed') ocrState = 'completed';
  else if (!managerResolved) ocrState = 'active';

  let managerState: ClaimProgressStepState = 'inactive';
  if (claim.claimStatus === 'rejected') managerState = 'failed';
  else if (managerPending) managerState = 'active';
  else if (managerResolved) managerState = 'completed';

  let paidState: ClaimProgressStepState = 'inactive';
  if (paid) paidState = 'completed';
  else if (payable && !managerPending) paidState = 'active';

  return [
    { key: 'submitted', label: 'Submitted', state: 'completed' },
    { key: 'ocr', label: 'OCR', state: ocrState },
    { key: 'manager', label: 'Manager', state: managerState },
    { key: 'paid', label: 'Paid', state: paidState },
  ];
}

export type ClaimTimelineEvent = {
  key: string;
  label: string;
  detail?: string;
  state: 'done' | 'current' | 'upcoming' | 'rejected';
};

export function claimTimelineEvents(claim: StaffClaimRow): ClaimTimelineEvent[] {
  const steps = claimProgressSteps(claim);
  const events: ClaimTimelineEvent[] = [];

  events.push({
    key: 'submitted',
    label: 'Submitted',
    detail: claim.submittedAt
      ? new Date(claim.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined,
    state: 'done',
  });

  const ocr = steps.find((s) => s.key === 'ocr');
  events.push({
    key: 'ocr',
    label: claim.ocrStatus === 'failed' ? 'OCR failed' : claim.ocrStatus === 'completed' ? 'Receipt scanned' : 'OCR in progress',
    state:
      ocr?.state === 'failed'
        ? 'rejected'
        : ocr?.state === 'completed'
          ? 'done'
          : ocr?.state === 'active'
            ? 'current'
            : 'upcoming',
  });

  const mgr = steps.find((s) => s.key === 'manager');
  const mgrLabel =
    claim.claimStatus === 'approved'
      ? 'Accepted'
      : claim.claimStatus === 'rejected'
        ? 'Rejected'
        : claim.claimStatus === 'partially_approved'
          ? `Limited (${claim.approvedAmount != null ? formatInr(claim.approvedAmount) : 'partial'})`
          : 'Manager review';
  events.push({
    key: 'manager',
    label: mgrLabel,
    state:
      mgr?.state === 'failed'
        ? 'rejected'
        : mgr?.state === 'completed'
          ? 'done'
          : mgr?.state === 'active'
            ? 'current'
            : 'upcoming',
  });

  const paid = steps.find((s) => s.key === 'paid');
  events.push({
    key: 'paid',
    label: claim.processingStatus === 'paid' ? 'Paid' : PROCESSING_STATUS_LABELS[claim.processingStatus] ?? 'Payment',
    state:
      paid?.state === 'completed' ? 'done' : paid?.state === 'active' ? 'current' : 'upcoming',
  });

  return events;
}

/** Staff-facing progress — no OCR step (employees never see OCR). */
export function claimStaffProgressSteps(claim: StaffClaimRow): ClaimProgressStep[] {
  const stillWaitingManagers = (claim.managerApprovals ?? []).some((a) => a.status === 'pending');
  const managerPending =
    claim.claimStatus === 'pending_approval' ||
    (claim.claimStatus === 'partially_approved' && stillWaitingManagers);
  const managerResolved =
    claim.claimStatus === 'approved' ||
    claim.claimStatus === 'rejected' ||
    (claim.claimStatus === 'partially_approved' && !stillWaitingManagers);
  const paid = claim.processingStatus === 'paid';
  const payable = claim.claimStatus === 'approved' || claim.claimStatus === 'partially_approved';

  let managerState: ClaimProgressStepState = 'inactive';
  if (claim.claimStatus === 'rejected') managerState = 'failed';
  else if (managerPending) managerState = 'active';
  else if (managerResolved) managerState = 'completed';

  let paidState: ClaimProgressStepState = 'inactive';
  if (paid) paidState = 'completed';
  else if (payable && !managerPending) paidState = 'active';

  return [
    { key: 'submitted', label: 'Submitted', state: 'completed' },
    { key: 'manager', label: 'Manager', state: managerState },
    { key: 'paid', label: 'Paid', state: paidState },
  ];
}

export function claimStaffTimelineEvents(claim: StaffClaimRow): ClaimTimelineEvent[] {
  const events: ClaimTimelineEvent[] = [];
  events.push({
    key: 'submitted',
    label: 'Submitted',
    detail: claim.submittedAt
      ? new Date(claim.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined,
    state: 'done',
  });

  const mgrState = claimStaffProgressSteps(claim).find((s) => s.key === 'manager');
  const mgrLabel =
    claim.claimStatus === 'approved'
      ? 'Accepted'
      : claim.claimStatus === 'rejected'
        ? 'Rejected'
        : claim.claimStatus === 'partially_approved'
          ? `Limited (${claim.approvedAmount != null ? formatInr(claim.approvedAmount) : 'partial'})`
          : 'Manager review';
  events.push({
    key: 'manager',
    label: mgrLabel,
    state:
      mgrState?.state === 'failed'
        ? 'rejected'
        : mgrState?.state === 'completed'
          ? 'done'
          : mgrState?.state === 'active'
            ? 'current'
            : 'upcoming',
  });

  const paidState = claimStaffProgressSteps(claim).find((s) => s.key === 'paid');
  events.push({
    key: 'paid',
    label: claim.processingStatus === 'paid' ? 'Paid' : PROCESSING_STATUS_LABELS[claim.processingStatus] ?? 'Payment',
    state: paidState?.state === 'completed' ? 'done' : paidState?.state === 'active' ? 'current' : 'upcoming',
  });

  return events;
}
