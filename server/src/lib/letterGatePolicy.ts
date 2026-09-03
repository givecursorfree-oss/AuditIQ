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

/** MKD policy: managers may assign/update team at any stage (letter gate relaxed per firm request). */
export function assertTeamAssignmentAllowed(
  _letterStatus: string,
  _assigningTeam: boolean,
  _hasExistingTeam = false
): TeamAssignmentGateResult {
  return { allowed: true };
}

export function engagementHasTeam(eng: {
  partnerInChargeId?: string | null;
  managerId?: string | null;
  articleAssistantId?: string | null;
}): boolean {
  return !!(eng.partnerInChargeId || eng.managerId || eng.articleAssistantId);
}
