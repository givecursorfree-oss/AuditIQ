/** Today's attendance punch state for post-login routing. */
export type AttendanceDayState = 'none' | 'open' | 'closed';

function hasValidCheckout(checkOut: string | null | undefined): boolean {
  if (checkOut == null || checkOut === '') return false;
  const t = new Date(checkOut).getTime();
  return Number.isFinite(t);
}

export function attendanceDayState(
  record: { checkIn?: string | null; checkOut?: string | null } | null | undefined
): AttendanceDayState {
  if (!record?.checkIn) return 'none';
  if (hasValidCheckout(record.checkOut)) return 'closed';
  return 'open';
}
