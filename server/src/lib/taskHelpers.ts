import type { Task } from '@prisma/client';
import { pipelineStageLabel, type EngagementPipelineContext } from './taskPipeline.js';

export const TASK_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const LEGACY_STATUS_MAP: Record<string, TaskStatus> = {
  Open: 'not_started',
  'In Progress': 'in_progress',
  Done: 'completed',
  Cancelled: 'completed',
};

export function normalizeTaskStatus(status: string): TaskStatus {
  if (TASK_STATUSES.includes(status as TaskStatus)) return status as TaskStatus;
  return LEGACY_STATUS_MAP[status] ?? 'not_started';
}

export function isTaskCompleted(status: string): boolean {
  const n = normalizeTaskStatus(status);
  return n === 'completed';
}

export function isTaskOverdue(task: Pick<Task, 'dueDate' | 'status'>): boolean {
  if (!task.dueDate || isTaskCompleted(task.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function displayTaskStatus(task: Pick<Task, 'dueDate' | 'status'>): string {
  if (isTaskOverdue(task)) return 'overdue';
  return normalizeTaskStatus(task.status);
}

export function enrichTask<T extends Task>(
  task: T,
  pipelineContext?: EngagementPipelineContext | null
): T & { isOverdue: boolean; displayStatus: string; pipelineStageLabel?: string | null } {
  const pipelineStage = (task as T & { pipelineStage?: string | null }).pipelineStage;
  return {
    ...task,
    status: normalizeTaskStatus(task.status),
    isOverdue: isTaskOverdue(task),
    displayStatus: displayTaskStatus(task),
    pipelineStageLabel: pipelineContext
      ? pipelineStageLabel(pipelineStage, pipelineContext)
      : pipelineStage
        ? pipelineStage
        : null,
  };
}
