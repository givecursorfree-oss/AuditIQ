import prisma from './prisma.js';
import {
  attendanceDayFilter,
  attendanceDayFilterDaysAgo,
  pickMeTodayAttendanceSession,
} from './attendanceDates.js';

const meTodaySelect = {
  id: true,
  checkIn: true,
  checkOut: true,
  status: true,
  date: true,
  method: true,
  location: true,
  lateBand: true,
  clientName: true,
  bioPresent: true,
  forgiven: true,
  totalActiveSeconds: true,
  gpsLat: true,
  gpsLng: true,
  gpsAccuracy: true,
  ipAddress: true,
} as const;

/** Today row + yesterday row (for overnight End day / resume). */
export async function loadTodayAndYesterdayAttendance(userId: string, now = new Date()) {
  const [today, yesterday] = await Promise.all([
    prisma.attendance.findFirst({
      where: { userId, date: attendanceDayFilter(now) },
    }),
    prisma.attendance.findFirst({
      where: { userId, date: attendanceDayFilterDaysAgo(1, now) },
    }),
  ]);
  return { today, yesterday };
}

export async function loadMeTodayAttendance(userId: string, now = new Date()) {
  const [today, yesterdayOpen] = await Promise.all([
    prisma.attendance.findFirst({
      where: { userId, date: attendanceDayFilter(now) },
      select: meTodaySelect,
    }),
    prisma.attendance.findFirst({
      where: {
        userId,
        date: attendanceDayFilterDaysAgo(1, now),
        checkIn: { not: null },
        checkOut: null,
      },
      select: meTodaySelect,
    }),
  ]);
  return pickMeTodayAttendanceSession(today, yesterdayOpen);
}
