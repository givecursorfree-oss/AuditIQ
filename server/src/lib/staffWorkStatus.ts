import prisma from './prisma.js';
import { attendanceDayFilter, attendanceDayStart } from './attendanceDates.js';

export type ActivityStatus = 'active' | 'away' | 'offline';

/** Mark attendance on first engagement timer start of the day (does not overwrite existing check-in). */
export async function ensureTimerClockIn(userId: string): Promise<{ clockedIn: boolean; checkIn: Date | null }> {
  const dayStart = attendanceDayStart();
  const existing = await prisma.attendance.findFirst({
    where: { userId, date: attendanceDayFilter() },
  });
  if (existing?.checkIn) {
    return { clockedIn: false, checkIn: existing.checkIn };
  }
  const now = new Date();
  if (existing) {
    const updated = await prisma.attendance.update({
      where: { id: existing.id },
      data: { checkIn: now, method: 'timer', status: 'present' },
    });
    return { clockedIn: true, checkIn: updated.checkIn };
  }
  const created = await prisma.attendance.create({
    data: {
      userId,
      date: dayStart,
      checkIn: now,
      method: 'timer',
      status: 'present',
    },
  });
  return { clockedIn: true, checkIn: created.checkIn };
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
