/** Today's attendance punch state for post-login routing. */
export type AttendanceDayState = 'none' | 'open' | 'closed';

export function attendanceDayState(
  record: { checkIn?: string | null; checkOut?: string | null } | null | undefined
): AttendanceDayState {
  if (!record?.checkIn) return 'none';
  if (record.checkOut) return 'closed';
  return 'open';
}
