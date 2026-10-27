import { Badge } from '@/components/ui/badge';
import {
  MANAGER_APPROVAL_STATUS_LABELS,
  claimEvidenceLines,
  managerApprovalBadgeVariant,
  personPolicyFlags,
  participantManagerApproval,
  staffName,
  type ClaimEvidenceTone,
  type ClaimParticipantRow,
  type StaffClaimRow,
} from '@/lib/expenseClaims';

const EVIDENCE_TONE: Record<ClaimEvidenceTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  muted: 'text-muted-foreground',
  error: 'text-destructive',
};

/** Log-off, thumbprint, and same-day duplicate flag for one covered person. */
export function ClaimParticipantEvidence({
  claim,
  participant,
  showApprovalStatus = true,
}: {
  claim: StaffClaimRow;
  participant: ClaimParticipantRow;
  showApprovalStatus?: boolean;
}) {
  const person = personPolicyFlags(claim, participant.user.id);
  // Prefer per-person flags; never fall back to payer-level times on group claims.
  const evidence = claim.claimType === 'food' ? claimEvidenceLines(person) : [];
  const approval = showApprovalStatus ? participantManagerApproval(claim, participant) : undefined;
  const duplicate = Boolean(person?.duplicateSameDay);

  if (evidence.length === 0 && !duplicate && !approval) return null;

  return (
    <div className="space-y-0.5 text-[11px]">
      {approval ? (
        <Badge variant={managerApprovalBadgeVariant(approval.status)} className="font-normal">
          {staffName(approval.manager)} · {MANAGER_APPROVAL_STATUS_LABELS[approval.status] ?? approval.status}
        </Badge>
      ) : null}
      {evidence.map((line) => (
        <p key={line.label}>
          <span className="text-foreground">{line.label}: </span>
          <span className={EVIDENCE_TONE[line.tone]}>
            {line.value}
            {line.mark ? ` ${line.mark}` : ''}
          </span>
        </p>
      ))}
      {duplicate ? (
        <p className="text-warning">Duplicate: another food claim for this person on the same day</p>
      ) : null}
    </div>
  );
}
