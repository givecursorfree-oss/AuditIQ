import type { Ref } from 'react';
import { m } from 'motion/react';
import { CheckCircle, CircleNotch, Clock } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  assigneeActionKind,
  assignerTaskStatus,
  isHighlightTarget,
  isTaskCompleted,
  needsAssigneeAction,
  type AssigneeActionKind,
  type AssignerTaskStatus,
} from '@/lib/taskHighlight';
import { cn } from '@/lib/utils';

export interface EngagementTaskRow {
  id: string;
  title: string;
  status: string;
  displayStatus?: string;
  isOverdue?: boolean;
  dueDate?: string | null;
  proposedTimeline?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  pipelineStage?: string | null;
  pipelineStageLabel?: string | null;
  assignee: { id: string; firstName: string; lastName: string };
  createdBy?: { id: string; firstName: string; lastName: string };
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
];

const ASSIGNER_STATUS: Record<AssignerTaskStatus, { label: string; className: string }> = {
  waiting: {
    label: 'Waiting on them',
    className: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-primary/10 text-primary border-primary/25',
  },
  completed: {
    label: 'Done',
    className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30',
  },
  blocked: {
    label: 'Blocked',
    className: 'bg-destructive/10 text-destructive border-destructive/25',
  },
};

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function statusLabel(t: EngagementTaskRow) {
  const s = t.displayStatus || t.status;
  if (s === 'overdue') return 'Overdue';
  return STATUS_OPTIONS.find((o) => o.value === s)?.label || s;
}

function actionCardTitle(kind: AssigneeActionKind) {
  if (kind === 'start') return 'Ready to start';
  if (kind === 'finish') return 'In progress';
  return 'Blocked — needs attention';
}

export function EngagementTaskActionCard({
  task,
  userId,
  reduceMotion,
  updatingTaskId,
  scrollTargetId,
  highlightTaskId,
  completingTaskId,
  highlightRowRef,
  onStatusChange,
}: {
  task: EngagementTaskRow;
  userId?: string;
  reduceMotion: boolean | null;
  updatingTaskId: string | null;
  scrollTargetId: string | null;
  highlightTaskId?: string | null;
  completingTaskId: string | null;
  highlightRowRef: Ref<HTMLDivElement>;
  onStatusChange: (taskId: string, status: string, notes?: string) => void | Promise<void>;
}) {
  const kind = assigneeActionKind(task, userId)!;
  const busy = updatingTaskId === task.id;

  return (
    <m.div
      id={`engagement-task-${task.id}`}
      ref={task.id === scrollTargetId ? highlightRowRef : undefined}
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98, height: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={cn(
        'engagement-task-action-card rounded-xl border-2 border-primary/50 bg-gradient-to-r from-primary/[0.12] to-primary/[0.04] p-4 shadow-sm',
        isHighlightTarget(task.id, highlightTaskId) && 'ring-2 ring-primary/40',
        completingTaskId === task.id && 'engagement-task-completing'
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            {actionCardTitle(kind)}
          </p>
          <p className="mt-1 text-base font-semibold text-foreground leading-snug">{task.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {task.dueDate ? (
              <span className="inline-flex items-center gap-1">
                <Clock size={14} aria-hidden />
                Due {formatShortDate(task.dueDate)}
              </span>
            ) : null}
            {task.proposedTimeline ? <span>Timeline: {task.proposedTimeline}</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {kind === 'start' ? (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void onStatusChange(task.id, 'in_progress', task.notes || undefined)}
              >
                {busy ? <CircleNotch size={16} className="animate-spin" /> : 'Start'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
                disabled={busy}
                onClick={() => void onStatusChange(task.id, 'completed', task.notes || undefined)}
              >
                <CheckCircle size={16} weight="fill" aria-hidden />
                Mark done
              </Button>
            </>
          ) : null}
          {kind === 'finish' ? (
            <>
              <Button
                size="sm"
                className="gap-1"
                disabled={busy}
                onClick={() => void onStatusChange(task.id, 'completed', task.notes || undefined)}
              >
                {busy ? (
                  <CircleNotch size={16} className="animate-spin" />
                ) : (
                  <CheckCircle size={16} weight="fill" aria-hidden />
                )}
                Mark done
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onStatusChange(task.id, 'blocked', task.notes || undefined)}
              >
                Blocked
              </Button>
            </>
          ) : null}
          {kind === 'blocked' ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void onStatusChange(task.id, 'in_progress', task.notes || undefined)}
            >
              Resume
            </Button>
          ) : null}
        </div>
      </div>
    </m.div>
  );
}

export function EngagementTaskCard({
  task,
  userId,
  isManager,
  pipelineSteps = [],
  actionTaskIds,
  scrollTargetId,
  highlightRowRef,
  updatingTaskId,
  recentlyCompletedId,
  completingTaskId,
  onStatusChange,
  onPipelineStageChange,
}: {
  task: EngagementTaskRow;
  userId?: string;
  isManager: boolean;
  pipelineSteps?: Array<{ code: string; label: string }>;
  actionTaskIds: string[];
  scrollTargetId: string | null;
  highlightRowRef: Ref<HTMLDivElement>;
  updatingTaskId: string | null;
  recentlyCompletedId: string | null;
  completingTaskId: string | null;
  onStatusChange: (taskId: string, status: string, notes?: string) => void | Promise<void>;
  onPipelineStageChange?: (taskId: string, pipelineStage: string) => void | Promise<void>;
}) {
  const isAction = needsAssigneeAction(task, userId);
  const completed = isTaskCompleted(task.status);
  const iAssigned = task.createdBy?.id === userId;
  const assignerChip = iAssigned ? ASSIGNER_STATUS[assignerTaskStatus(task)] : null;
  const canEditStatus = userId === task.assignee.id || isManager;
  const busy = updatingTaskId === task.id;
  const justFinished = recentlyCompletedId === task.id;
  const hasActionTasks = actionTaskIds.length > 0;

  return (
    <div
      id={!hasActionTasks && task.id === scrollTargetId ? `engagement-task-${task.id}` : undefined}
      ref={!hasActionTasks && task.id === scrollTargetId ? highlightRowRef : undefined}
      className={cn(
        'rounded-lg border p-3 transition-colors',
        completed
          ? 'border-border/60 bg-muted/30 opacity-90'
          : 'border-border bg-card',
        isAction && !completed && 'border-primary/30 bg-primary/[0.04]',
        task.isOverdue && !completed && 'border-destructive/30 bg-destructive/5',
        justFinished && 'ring-2 ring-emerald-500/40',
        completingTaskId === task.id && 'engagement-task-completing'
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                'font-medium text-foreground',
                completed && 'text-muted-foreground line-through decoration-muted-foreground/50'
              )}
            >
              {task.title}
            </p>
            {isAction ? (
              <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                Do now
              </span>
            ) : null}
            {assignerChip ? (
              <span
                className={cn(
                  'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                  assignerChip.className
                )}
              >
                {assignerChip.label}
              </span>
            ) : null}
            {task.pipelineStageLabel ? (
              <span className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {task.pipelineStageLabel}
              </span>
            ) : null}
            {justFinished ? (
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                Just completed
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {task.assignee.firstName} {task.assignee.lastName}
            {task.dueDate ? ` · Due ${formatShortDate(task.dueDate)}` : ''}
            {task.proposedTimeline ? ` · ${task.proposedTimeline}` : ''}
            {completed && task.completedAt
              ? ` · Done ${formatShortDate(task.completedAt)}`
              : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {isManager && onPipelineStageChange && pipelineSteps.length > 0 ? (
            <Select
              value={task.pipelineStage ?? pipelineSteps[0]?.code ?? ''}
              disabled={busy}
              onValueChange={(v) => void onPipelineStageChange(task.id, v)}
            >
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue>{task.pipelineStageLabel ?? 'Stage'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pipelineSteps.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {canEditStatus && !completed ? (
            <Select
              value={task.status === 'overdue' ? 'in_progress' : task.status}
              disabled={busy}
              onValueChange={(v) => void onStatusChange(task.id, v, task.notes || undefined)}
            >
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue>{statusLabel(task)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span
              className={cn(
                'inline-flex h-8 items-center rounded-md border px-2 text-xs font-medium',
                completed
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-border text-muted-foreground'
              )}
            >
              {statusLabel(task)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
