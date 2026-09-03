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

/** Client mirror — team may be assigned anytime (letter gate relaxed). */
export function isTeamAssignmentBlocked(
  _letterStatus?: string | null,
  _hasExistingTeam = false
): boolean {
  return false;
}
