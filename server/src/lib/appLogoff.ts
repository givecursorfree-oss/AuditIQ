import prisma from './prisma.js';
import { attendanceDayFilter, formatIstHm } from './attendanceDates.js';

/**
 * App log-off is the attendance End day punch for that IST date.
 * A mid-day timer stop is used only when the day was never ended.
 */
export async function getComputerLogoffTime(userId: string, date: Date): Promise<string | null> {
  const day = attendanceDayFilter(date);
  const att = await prisma.attendance.findFirst({
    where: { userId, date: day, checkOut: { not: null } },
    orderBy: { checkOut: 'desc' },
    select: { checkOut: true },
  });
  if (att?.checkOut) return formatIstHm(att.checkOut);

  const entry = await prisma.timeEntry.findFirst({
    where: { userId, endedAt: day },
    orderBy: { endedAt: 'desc' },
    select: { endedAt: true },
  });
  if (entry?.endedAt) return formatIstHm(entry.endedAt);
  return null;
}
