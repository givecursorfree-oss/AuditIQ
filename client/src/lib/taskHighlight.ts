/** Normalize overdue display to workflow status */
export function normalizedTaskStatus(status: string): string {
  return status === 'overdue' ? 'in_progress' : status;
}

export function isTaskCompleted(status: string): boolean {
  return normalizedTaskStatus(status) === 'completed';
}

export function isTaskActive(status: string): boolean {
  return !isTaskCompleted(status);
}

export type AssigneeActionKind = 'start' | 'finish' | 'blocked';

/** What the assignee should do next on this task */
export function assigneeActionKind(
  task: {
    status: string;
    assignee: { id: string };
  },
  viewerId: string | undefined
): AssigneeActionKind | null {
  if (!viewerId || task.assignee.id !== viewerId) return null;
  const s = normalizedTaskStatus(task.status);
  if (s === 'not_started') return 'start';
  if (s === 'in_progress') return 'finish';
  if (s === 'blocked') return 'blocked';
  return null;
}

/** Task still needs assignee action — prominent until started or finished */
export function needsAssigneeAction(
  task: {
    id: string;
    status: string;
    assignee: { id: string };
  },
  viewerId: string | undefined
): boolean {
  return assigneeActionKind(task, viewerId) !== null;
}

/** Deep-link scroll target (notification / Dynamic Island) */
export function isHighlightTarget(taskId: string, highlightTaskId?: string | null): boolean {
  return Boolean(highlightTaskId && taskId === highlightTaskId);
}

export type AssignerTaskStatus = 'waiting' | 'in_progress' | 'completed' | 'blocked';

export function assignerTaskStatus(task: { status: string; displayStatus?: string }): AssignerTaskStatus {
  const s = task.displayStatus || task.status;
  if (s === 'overdue') return 'waiting';
  if (s === 'not_started') return 'waiting';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'blocked') return 'blocked';
  if (s === 'completed') return 'completed';
  return 'waiting';
}
