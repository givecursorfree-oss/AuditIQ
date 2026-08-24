/**
 * Compute Article Assistant attendance leave debit for a period (or all time).
 * Bio gate skipped when bioPresent is null (import not yet wired).
 */
import prisma from './prisma.js';
import {
  isNoAttendanceDay,
  lateLeaveDebitDays,
  noAttendanceLeaveDebitDays,
  totalAttendanceLeaveDebit,
  type PlaceOfWork,
  PLACE_OFFICE,
} from './articleAttendancePolicy.js';
import { getAttendanceDateKey, getAttendanceDayRange, attendanceDayStart } from './attendanceDates.js';

export async function userIsArticleAssistant(userId: string): Promise<boolean> {
  const row = await prisma.articleshipRecord.findUnique({
    where: { userId },
    select: { id: true },
  });
  return !!row;
}

export async function hasTimesheetOnDate(userId: string, day: Date): Promise<boolean> {
  const { start, end } = getAttendanceDayRange(day);
  const count = await prisma.timeEntry.count({
    where: {
      userId,
      OR: [
        { date: { gte: start, lte: end } },
        { startedAt: { gte: start, lte: end } },
      ],
    },
  });
  return count > 0;
}

export async function hasWfhApproval(userId: string, day: Date): Promise<{
  ok: boolean;
  approvedById?: string;
}> {
  const dayStart = getAttendanceDayRange(day).start;
  const row = await prisma.wfhApproval.findUnique({
    where: { userId_date: { userId, date: dayStart } },
  });
  return row ? { ok: true, approvedById: row.approvedById } : { ok: false };
}

export type ArticleAttendanceDebitSummary = {
  softLateCount: number;
  hardLateCount: number;
  noAttdCount: number;
  lateDebitDays: number;
  noAttdDebitDays: number;
  totalDebitDays: number;
};

/** IST weekday 0=Sun … 6=Sat from YYYY-MM-DD key */
function istWeekday(dayStart: Date): number {
  const key = getAttendanceDateKey(dayStart);
  return new Date(`${key}T12:00:00+05:30`).getUTCDay();
}

function eachDayStart(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cur = attendanceDayStart(from);
  const end = attendanceDayStart(to);
  while (cur.getTime() <= end.getTime()) {
    out.push(cur);
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
    cur = attendanceDayStart(cur);
  }
  return out;
}

export async function computeArticleAttendanceDebit(
  userId: string,
  range?: { from: Date; to: Date }
): Promise<ArticleAttendanceDebitSummary> {
  const records = await prisma.attendance.findMany({
    where: {
      userId,
      ...(range ? { date: { gte: range.from, lte: range.to } } : {}),
    },
    select: {
      date: true,
      checkIn: true,
      location: true,
      lateBand: true,
      bioPresent: true,
      forgiven: true,
      status: true,
    },
  });

  let softLateCount = 0;
  let hardLateCount = 0;
  let noAttdCount = 0;
  const seenKeys = new Set<string>();

  for (const r of records) {
    seenKeys.add(getAttendanceDateKey(r.date));
    if (r.lateBand === 'soft_late') softLateCount += 1;
    else if (r.lateBand === 'hard_late') hardLateCount += 1;

    const hasTimesheet = await hasTimesheetOnDate(userId, r.date);
    if (
      isNoAttendanceDay({
        placeOfWork: (r.location as PlaceOfWork) || PLACE_OFFICE,
        hasCheckIn: !!r.checkIn && r.status !== 'wfh-pending',
        bioPresent: r.bioPresent,
        hasTimesheet,
        forgiven: r.forgiven,
      })
    ) {
      noAttdCount += 1;
    }
  }

  // Days with no attendance row at all (Mon–Sat). Sundays skipped.
  // ponytail: firm holiday master not in DB yet — holidays may false-count until holiday list ships.
  if (range) {
    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        userId,
        status: 'Approved',
        fromDate: { lte: range.to },
        toDate: { gte: range.from },
      },
      select: { fromDate: true, toDate: true },
    });
    for (const day of eachDayStart(range.from, range.to)) {
      const key = getAttendanceDateKey(day);
      if (seenKeys.has(key)) continue;
      if (istWeekday(day) === 0) continue; // Sunday
      const onLeave = approvedLeaves.some(
        (l) => day.getTime() >= attendanceDayStart(l.fromDate).getTime() &&
          day.getTime() <= getAttendanceDayRange(l.toDate).end.getTime()
      );
      if (onLeave) continue;
      // Cap: don't debit future days
      if (day.getTime() > Date.now()) continue;
      noAttdCount += 1;
    }
  }

  const lateDebitDays = lateLeaveDebitDays(softLateCount, hardLateCount);
  const noAttdDebitDays = noAttendanceLeaveDebitDays(noAttdCount);
  return {
    softLateCount,
    hardLateCount,
    noAttdCount,
    lateDebitDays,
    noAttdDebitDays,
    totalDebitDays: totalAttendanceLeaveDebit({ softLateCount, hardLateCount, noAttdCount }),
  };
}
