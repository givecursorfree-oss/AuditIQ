/** Client mirror of server letter gate — initial team assignment requires signed letter. */

const LETTER_GATE_BLOCKED_STATUSES = ['draft', 'sent', 'rejected'] as const;

function needsSignedLetterForTeamAssignment(letterStatus: string): boolean {
  return (
    letterStatus !== 'not_required' &&
    (LETTER_GATE_BLOCKED_STATUSES as readonly string[]).includes(letterStatus)
  );
}

export const LETTER_GATE_MESSAGE =
  'Waiting for client to sign engagement letter';

/** True when the engagement already has partner, manager, or staff assigned. */
export function engagementHasTeam(eng: {
  partnerInChargeId?: string | null;
  managerId?: string | null;
  articleAssistantId?: string | null;
}): boolean {
  return !!(eng.partnerInChargeId || eng.managerId || eng.articleAssistantId);
}

/** Blocks only the first team assignment until the letter is signed; updates are always allowed. */
export function isTeamAssignmentBlocked(
  letterStatus?: string | null,
  hasExistingTeam = false
): boolean {
  if (hasExistingTeam) return false;
  if (!letterStatus) return false;
  return needsSignedLetterForTeamAssignment(letterStatus);
}
