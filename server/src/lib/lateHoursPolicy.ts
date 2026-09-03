/** Max minutes claimed end time may differ from log-off/biometric before flagging. */
export const LATE_HOURS_MISMATCH_THRESHOLD_MINUTES = 30;

export type LateHoursVerification = {
  computerMismatchMinutes: number | null;
  fingerprintMismatchMinutes: number | null;
  flagged: boolean;
  flagReason: string | null;
};

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesDiff(claimed: string, reference: string | null | undefined): number | null {
  if (!reference) return null;
  return Math.abs(parseTimeToMinutes(claimed) - parseTimeToMinutes(reference));
}

export function verifyLateHoursClaim(input: {
  actualEndTime: string;
  computerLogoffTime?: string | null;
  fingerprintLogoffTime?: string | null;
  thresholdMinutes?: number;
}): LateHoursVerification {
  const threshold = input.thresholdMinutes ?? LATE_HOURS_MISMATCH_THRESHOLD_MINUTES;
  const computerMismatchMinutes = minutesDiff(input.actualEndTime, input.computerLogoffTime);
  const fingerprintMismatchMinutes = minutesDiff(input.actualEndTime, input.fingerprintLogoffTime);

  const computerFlag =
    computerMismatchMinutes != null && computerMismatchMinutes > threshold;
  const fingerprintFlag =
    fingerprintMismatchMinutes != null && fingerprintMismatchMinutes > threshold;

  const reasons: string[] = [];
  if (computerFlag) {
    reasons.push(`Computer log-off differs by ${computerMismatchMinutes} min`);
  }
  if (fingerprintFlag) {
    reasons.push(`Fingerprint log-off differs by ${fingerprintMismatchMinutes} min`);
  }
  if (!input.computerLogoffTime && !input.fingerprintLogoffTime) {
    reasons.push('No computer or biometric log-off record for this date');
  }

  const flagged = computerFlag || fingerprintFlag || reasons.length > 0;

  return {
    computerMismatchMinutes,
    fingerprintMismatchMinutes,
    flagged,
    flagReason: flagged ? reasons.join('; ') : null,
  };
}
