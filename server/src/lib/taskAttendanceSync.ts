import prisma from './prisma.js';
import { syncAttendanceActivity } from './staffWorkStatus.js';

/** ponytail: flat default when no estimate/timer — bump if tasks routinely log zero hours */
const DEFAULT_TASK_HOURS = 0.5;

/**
 * F1 — When a task is marked complete, ensure a time entry exists and credit
 * attendance active seconds (GPS punch flow remains separate; this supplements it).
 */
export async function syncAttendanceFromTaskCompletion(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { timeEntries: true },
  });
  if (!task?.completedAt || !task.engagementId) return;

  let totalHours = task.timeEntries.reduce((sum, entry) => sum + entry.hours, 0);

  if (totalHours <= 0) {
    const hours =
      task.estimatedHours && task.estimatedHours > 0 ? task.estimatedHours : DEFAULT_TASK_HOURS;
    await prisma.timeEntry.create({
      data: {
        date: task.completedAt,
        hours,
        description: `Task completed: ${task.title}`,
        engagementId: task.engagementId,
        userId: task.assigneeId,
        taskId: task.id,
        source: 'task_completion',
        isBillable: true,
        stage: task.pipelineStage ?? undefined,
      },
    });
    totalHours = hours;
  }

  const activeSeconds = Math.round(totalHours * 3600);
  if (activeSeconds > 0) {
    await syncAttendanceActivity(task.assigneeId, activeSeconds, 0);
  }
}

/** Hours logged via task completion for a user on a calendar day (IST date key YYYY-MM-DD). */
export async function taskDerivedHoursForDay(userId: string, dateKey: string): Promise<number> {
  const start = new Date(`${dateKey}T00:00:00.000+05:30`);
  const end = new Date(`${dateKey}T23:59:59.999+05:30`);
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      source: 'task_completion',
      date: { gte: start, lte: end },
    },
    select: { hours: true },
  });
  return entries.reduce((sum, e) => sum + e.hours, 0);
}
