/** Food claim late-sitting policy — never blocks submission; flags for manager only. */

export type FoodPolicyFlags = {
  lateSittingException?: boolean;
  lateSittingReason?: string;
  computerLogoffTime?: string | null;
  fingerprintLogoffTime?: string | null;
  logoffMismatch?: boolean;
  logoffMismatchReason?: string | null;
};

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Mon–Fri ≥ 19:00, Sat ≥ 14:00, Sun = exception flag always */
export function evaluateFoodLateSittingPolicy(
  expenseDate: Date,
  actualEndTime?: string | null
): FoodPolicyFlags {
  const day = expenseDate.getDay(); // 0 Sun … 6 Sat
  if (day === 0) {
    return { lateSittingException: true, lateSittingReason: 'Sunday — review required' };
  }
  if (!actualEndTime) {
    return { lateSittingException: true, lateSittingReason: 'No end time on record — review required' };
  }
  const mins = parseTimeToMinutes(actualEndTime);
  if (day === 6) {
    if (mins < 14 * 60) {
      return { lateSittingException: true, lateSittingReason: 'Saturday before 2:00 PM' };
    }
    return {};
  }
  if (mins < 19 * 60) {
    return { lateSittingException: true, lateSittingReason: 'Weekday before 7:00 PM' };
  }
  return {};
}

export function hasPolicyException(flags: FoodPolicyFlags | null | undefined): boolean {
  return !!(flags?.lateSittingException || flags?.logoffMismatch);
}
