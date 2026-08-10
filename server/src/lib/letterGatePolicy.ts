/** Letter statuses that block team assignment when letter workflow is active. */
export const LETTER_GATE_BLOCKED_STATUSES = ['draft', 'sent', 'rejected'] as const;

export type LetterGateBlockedStatus = (typeof LETTER_GATE_BLOCKED_STATUSES)[number];

export function needsSignedLetterForTeamAssignment(letterStatus: string): boolean {
  return (
    letterStatus !== 'not_required' &&
    (LETTER_GATE_BLOCKED_STATUSES as readonly string[]).includes(letterStatus)
  );
}

export type TeamAssignmentGateResult =
  | { allowed: true }
  | { allowed: false; error: string; letterStatus: string };

/** MKD policy: initial team assignment requires signed letter; updates anytime once team exists. */
export function assertTeamAssignmentAllowed(
  letterStatus: string,
  assigningTeam: boolean,
  hasExistingTeam = false
): TeamAssignmentGateResult {
  if (!assigningTeam) return { allowed: true };
  if (hasExistingTeam) return { allowed: true };
  if (!needsSignedLetterForTeamAssignment(letterStatus)) return { allowed: true };
  return {
    allowed: false,
    error: 'Waiting for client to sign engagement letter',
    letterStatus,
  };
}

export function engagementHasTeam(eng: {
  partnerInChargeId?: string | null;
  managerId?: string | null;
  articleAssistantId?: string | null;
}): boolean {
  return !!(eng.partnerInChargeId || eng.managerId || eng.articleAssistantId);
}
