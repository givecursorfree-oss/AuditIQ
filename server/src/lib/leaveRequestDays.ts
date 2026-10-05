/** Calendar-day span for a leave application. Half day is a single date worth 0.5. */
export function leaveRequestDays(
  start: string,
  end: string,
  halfDay: boolean
): { days: number } | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { error: 'Dates must be YYYY-MM-DD' };
  }
  if (end < start) return { error: 'End date must be after start date' };
  if (halfDay && start !== end) return { error: 'Half day leave is for a single date' };
  if (halfDay) return { days: 0.5 };
  const from = Date.parse(`${start}T00:00:00.000Z`);
  const to = Date.parse(`${end}T00:00:00.000Z`);
  return { days: Math.max(1, Math.round((to - from) / 86400000) + 1) };
}
