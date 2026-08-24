import prisma from './prisma.js';
import { attendanceDayFilter } from './attendanceDates.js';

export type ActivityStatus = 'active' | 'away' | 'offline';

/** Timer does not mark attendance — login check-in is the single daily punch. */
export async function ensureTimerClockIn(userId: string): Promise<{ clockedIn: boolean; checkIn: Date | null }> {
  const existing = await prisma.attendance.findFirst({
    where: { userId, date: attendanceDayFilter() },
  });
  return { clockedIn: false, checkIn: existing?.checkIn ?? null };
}

export async function upsertStaffWorkStatus(
  userId: string,
  data: {
    activityStatus?: ActivityStatus;
    currentEngagementId?: string | null;
    currentStage?: string | null;
    timerStartedAt?: Date | null;
    lastActiveAt?: Date;
    awaySince?: Date | null;
  }
) {
  const now = new Date();
  const statusChanged =
    data.activityStatus !== undefined;

  return prisma.staffWorkStatus.upsert({
    where: { userId },
    create: {
      userId,
      activityStatus: data.activityStatus ?? 'active',
      currentEngagementId: data.currentEngagementId ?? null,
      currentStage: data.currentStage ?? null,
      timerStartedAt: data.timerStartedAt ?? null,
      lastActiveAt: data.lastActiveAt ?? now,
      awaySince: data.awaySince ?? null,
      statusChangedAt: now,
    },
    update: {
      ...(data.activityStatus !== undefined && { activityStatus: data.activityStatus }),
      ...(data.currentEngagementId !== undefined && { currentEngagementId: data.currentEngagementId }),
      ...(data.currentStage !== undefined && { currentStage: data.currentStage }),
      ...(data.timerStartedAt !== undefined && { timerStartedAt: data.timerStartedAt }),
      ...(data.lastActiveAt !== undefined && { lastActiveAt: data.lastActiveAt }),
      ...(data.awaySince !== undefined && { awaySince: data.awaySince }),
      ...(statusChanged && { statusChangedAt: now }),
    },
  });
}

export async function clearStaffTimerContext(userId: string) {
  return upsertStaffWorkStatus(userId, {
    currentEngagementId: null,
    currentStage: null,
    timerStartedAt: null,
  });
}

export async function syncAttendanceActivity(
  userId: string,
  activeDeltaSeconds: number,
  awayDeltaSeconds: number
) {
  const record = await prisma.attendance.findFirst({
    where: { userId, date: attendanceDayFilter() },
  });
  if (!record) return null;
  return prisma.attendance.update({
    where: { id: record.id },
    data: {
      totalActiveSeconds: { increment: Math.max(0, activeDeltaSeconds) },
      totalAwaySeconds: { increment: Math.max(0, awayDeltaSeconds) },
    },
  });
}
