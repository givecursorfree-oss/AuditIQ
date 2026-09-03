import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import {
  CheckCircle,
  CircleNotch,
  Clock,
  ListChecks,
  Plus,
  Sparkle,
  Table,
  UserCircle,
} from '@phosphor-icons/react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useAppToast } from '@/context/AppToastContext';
import { useEngagementTasksSocket } from '@/hooks/useEngagementTasksSocket';
import { PanelCard } from '@/components/layout/PanelCard';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import StaffAvailabilityPanel from './StaffAvailabilityPanel';
import {
  EngagementTaskActionCard,
  EngagementTaskCard,
} from './EngagementTasksTaskCards';
import {
  assignerTaskStatus,
  isTaskActive,
  isTaskCompleted,
  needsAssigneeAction,
  normalizedTaskStatus,
  type AssignerTaskStatus,
} from '@/lib/taskHighlight';
import { cn } from '@/lib/utils';

interface TaskRow {
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

interface PipelineStep {
  code: string;
  label: string;
}

interface TeamUser {
  id: string;
  firstName: string;
  lastName: string;
  role?: string;
}

interface Props {
  engagementId: string;
  highlightTaskId?: string | null;
}

type ListFilter = 'active' | 'completed' | 'all';

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

function statusLabel(t: TaskRow) {
  const s = t.displayStatus || t.status;
  if (s === 'overdue') return 'Overdue';
  return STATUS_OPTIONS.find((o) => o.value === s)?.label || s;
}

export default function EngagementTasksTab({ engagementId, highlightTaskId }: Props) {
  const { user } = useAuth();
  const { showToast } = useAppToast();
  const reduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const isManager = user && ['Partner', 'Admin', 'Manager'].includes(user.role);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const highlightRowRef = useRef<HTMLDivElement | null>(null);
  const [teamStaff, setTeamStaff] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState<ListFilter>('active');
  const [compactView, setCompactView] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [recentlyCompletedId, setRecentlyCompletedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [completeDialog, setCompleteDialog] = useState<{
    taskId: string;
    title: string;
    notes: string;
  } | null>(null);
  const [availabilityStaffId, setAvailabilityStaffId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    assigneeId: '',
    dueDate: '',
    proposedTimeline: '',
    estimatedHours: '',
    notes: '',
    pipelineStage: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, teamRes] = await Promise.all([
        api.get<TaskRow[] | { tasks: TaskRow[]; pipelineSteps: PipelineStep[] }>(
          `/tasks?engagementId=${engagementId}`
        ),
        api.get<{
          managers: TeamUser[];
          staff: TeamUser[];
          primary: { partner: TeamUser | null; article: TeamUser | null };
        }>(`/engagements/${engagementId}/team`),
      ]);
      const taskPayload = tasksRes.data;
      if (Array.isArray(taskPayload)) {
        setTasks(taskPayload);
        setPipelineSteps([]);
      } else {
        setTasks(taskPayload.tasks);
        setPipelineSteps(taskPayload.pipelineSteps ?? []);
      }
      const fromTeam = [
        ...(teamRes.data.managers ?? []),
        ...(teamRes.data.staff ?? []),
        ...(teamRes.data.primary.partner ? [teamRes.data.primary.partner] : []),
        ...(teamRes.data.primary.article ? [teamRes.data.primary.article] : []),
      ];
      const uniqueTeam = [...new Map(fromTeam.map((u) => [u.id, u])).values()];
      setTeamStaff(uniqueTeam);
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEngagementTasksSocket(engagementId, (payload) => {
    if (payload.completedById === user?.id) return;
    void load();
    if (payload.createdById && payload.createdById === user?.id) {
      setRecentlyCompletedId(payload.taskId);
      window.setTimeout(() => setRecentlyCompletedId(null), 4000);
      showToast({
        title: 'Task completed',
        message: payload.completedByName
          ? `${payload.completedByName} finished “${payload.title}”.`
          : `“${payload.title}” is done.`,
        variant: 'success',
      });
    }
  });

  const assigneeOptions = teamStaff;

  const needsAction = useCallback(
    (t: TaskRow) => needsAssigneeAction(t, user?.id),
    [user?.id]
  );

  const actionTasks = useMemo(
    () => tasks.filter((t) => needsAction(t)),
    [tasks, needsAction]
  );

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aAction = needsAction(a);
      const bAction = needsAction(b);
      if (aAction !== bAction) return aAction ? -1 : 1;
      if (isTaskCompleted(a.status) !== isTaskCompleted(b.status)) {
        return isTaskCompleted(a.status) ? 1 : -1;
      }
      return 0;
    });
  }, [tasks, needsAction]);

  const activeCount = useMemo(() => tasks.filter((t) => isTaskActive(t.status)).length, [tasks]);
  const completedCount = useMemo(() => tasks.filter((t) => isTaskCompleted(t.status)).length, [tasks]);
  const progressPct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  const filteredTasks = useMemo(() => {
    if (listFilter === 'active') return sortedTasks.filter((t) => isTaskActive(t.status));
    if (listFilter === 'completed') return sortedTasks.filter((t) => isTaskCompleted(t.status));
    return sortedTasks;
  }, [sortedTasks, listFilter]);

  const tasksIAssigned = useMemo(
    () => sortedTasks.filter((t) => t.createdBy?.id === user?.id),
    [sortedTasks, user?.id]
  );

  const assignerCounts = useMemo(() => {
    const counts = { waiting: 0, in_progress: 0, completed: 0, blocked: 0 };
    for (const t of tasksIAssigned) {
      counts[assignerTaskStatus(t)] += 1;
    }
    return counts;
  }, [tasksIAssigned]);

  const myAssigneeTasks = useMemo(
    () => tasks.filter((t) => t.assignee.id === user?.id),
    [tasks, user?.id]
  );
  const allMineDone =
    myAssigneeTasks.length > 0 && myAssigneeTasks.every((t) => isTaskCompleted(t.status));
  const allEngagementDone = tasks.length > 0 && tasks.every((t) => isTaskCompleted(t.status));

  const scrollTargetId = useMemo(() => {
    if (highlightTaskId && sortedTasks.some((t) => t.id === highlightTaskId)) {
      return highlightTaskId;
    }
    return sortedTasks.find((t) => needsAction(t))?.id ?? null;
  }, [highlightTaskId, sortedTasks, needsAction]);

  useEffect(() => {
    if (!scrollTargetId || loading) return;
    const row = highlightRowRef.current;
    if (!row) return;
    const t = window.setTimeout(() => {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [scrollTargetId, loading, sortedTasks.length]);

  async function patchTaskStatus(taskId: string, status: string, notes?: string) {
    const task = tasks.find((t) => t.id === taskId);
    const isAssignee = task?.assignee.id === user?.id;
    if (isAssignee) {
      await api.patch(`/tasks/${taskId}/status`, { status, notes });
    } else if (isManager) {
      await api.patch(`/tasks/${taskId}`, { status, notes });
    } else {
      throw new Error('Not allowed');
    }
  }

  async function applyStatusChange(
    taskId: string,
    status: string,
    notes?: string,
    options?: { skipNotePrompt?: boolean; silent?: boolean }
  ) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (
      status === 'completed' &&
      !options?.skipNotePrompt &&
      !notes?.trim() &&
      !(task.notes?.trim())
    ) {
      setCompleteDialog({ taskId, title: task.title, notes: '' });
      return;
    }

    const prevStatus = task.status;
    const mergedNotes = notes ?? task.notes ?? undefined;
    setUpdatingTaskId(taskId);
    const snapshot = tasks;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status,
              notes: mergedNotes ?? t.notes,
              displayStatus: status,
              completedAt: status === 'completed' ? new Date().toISOString() : t.completedAt,
            }
          : t
      )
    );

    if (status === 'completed') {
      setCompletingTaskId(taskId);
      window.setTimeout(() => setCompletingTaskId(null), 450);
    }

    try {
      await patchTaskStatus(taskId, status, mergedNotes);
      if (highlightTaskId === taskId) {
        const params = new URLSearchParams(searchParams);
        params.delete('taskId');
        setSearchParams(params, { replace: true });
      }
      if (!options?.silent) {
        if (status === 'in_progress' && normalizedTaskStatus(prevStatus) === 'not_started') {
          showToast({ title: 'Started', message: task.title, variant: 'info' });
        } else if (status === 'completed') {
          showToast({
            title: 'Task completed',
            message: task.title,
            variant: 'success',
            durationMs: 8000,
            action: {
              label: 'Undo',
              onClick: () => {
                void applyStatusChange(taskId, 'in_progress', mergedNotes, {
                  skipNotePrompt: true,
                  silent: true,
                }).then(() => {
                  showToast({ title: 'Undone', message: task.title, variant: 'info' });
                });
              },
            },
          });
        } else if (status === 'blocked') {
          showToast({ title: 'Marked blocked', message: task.title, variant: 'warning' });
        }
      }
      await load();
    } catch {
      setTasks(snapshot);
      showToast({
        title: 'Could not update task',
        message: 'Please try again.',
        variant: 'error',
      });
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function applyPipelineStageChange(taskId: string, pipelineStage: string) {
    if (!isManager) return;
    setUpdatingTaskId(taskId);
    const snapshot = tasks;
    const step = pipelineSteps.find((s) => s.code === pipelineStage);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, pipelineStage, pipelineStageLabel: step?.label ?? pipelineStage }
          : t
      )
    );
    try {
      await api.patch(`/tasks/${taskId}`, { pipelineStage });
    } catch {
      setTasks(snapshot);
      showToast({
        title: 'Could not update pipeline stage',
        message: 'Please try again.',
        variant: 'error',
      });
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function createTask() {
    const title = form.title;
    await api.post('/tasks', {
      title,
      assigneeId: form.assigneeId,
      engagementId,
      dueDate: form.dueDate || undefined,
      proposedTimeline: form.proposedTimeline || undefined,
      estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined,
      notes: form.notes || undefined,
      pipelineStage: form.pipelineStage || undefined,
    });
    setModalOpen(false);
    setForm({
      title: '',
      assigneeId: '',
      dueDate: '',
      proposedTimeline: '',
      estimatedHours: '',
      notes: '',
      pipelineStage: '',
    });
    showToast({ title: 'Task assigned', message: title, variant: 'success' });
    await load();
  }

  return (
    <PanelCard
      title="Engagement tasks"
      action={
        <div className="flex items-center gap-2">
          {isManager ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs"
              onClick={() => setCompactView((v) => !v)}
            >
              <Table size={14} />
              {compactView ? 'Cards' : 'Table'}
            </Button>
          ) : null}
          {isManager ? (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus size={16} className="mr-1" /> Add task
            </Button>
          ) : null}
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks yet.{isManager ? ' Use Add task to assign work to your team.' : ''}
        </p>
      ) : (
        <>
          <div className="mb-4 space-y-2" role="status" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-foreground">
                {completedCount} of {tasks.length} complete
              </span>
              <span className="text-muted-foreground tabular-nums">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>

          {allEngagementDone ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-200">
              <Sparkle size={18} weight="fill" className="shrink-0" aria-hidden />
              All tasks on this engagement are complete.
            </div>
          ) : null}

          {allMineDone && !allEngagementDone ? (
            <div className="mb-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-foreground">
              You&apos;re caught up on your tasks for this engagement.
            </div>
          ) : null}

          <Tabs
            value={listFilter}
            onValueChange={(v) => setListFilter(v as ListFilter)}
            className="mb-4"
          >
            <TabsList className="h-9 w-full sm:w-auto">
              <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
              <TabsTrigger value="completed">Done ({completedCount})</TabsTrigger>
              <TabsTrigger value="all">All ({tasks.length})</TabsTrigger>
            </TabsList>
          </Tabs>

          {actionTasks.length > 0 && listFilter !== 'completed' ? (
            <div className="mb-4 space-y-3" role="region" aria-label="Your action items">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ListChecks size={18} className="text-primary shrink-0" aria-hidden />
                <span>
                  {actionTasks.length === 1
                    ? '1 task needs you'
                    : `${actionTasks.length} tasks need you`}
                </span>
              </div>
              <AnimatePresence mode="popLayout">
                {actionTasks.map((t) => (
                  <EngagementTaskActionCard
                    key={t.id}
                    task={t}
                    userId={user?.id}
                    reduceMotion={reduceMotion}
                    updatingTaskId={updatingTaskId}
                    scrollTargetId={scrollTargetId}
                    highlightTaskId={highlightTaskId}
                    completingTaskId={completingTaskId}
                    highlightRowRef={highlightRowRef}
                    onStatusChange={applyStatusChange}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : null}

          {tasksIAssigned.length > 0 ? (
            <div
              className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm"
              role="status"
            >
              <span className="font-medium text-foreground">Tasks you assigned</span>
              <span className="text-muted-foreground">
                <strong className="text-amber-700 dark:text-amber-300">{assignerCounts.waiting}</strong>{' '}
                waiting
                {' · '}
                <strong className="text-primary">{assignerCounts.in_progress}</strong> in progress
                {' · '}
                <strong className="text-emerald-700 dark:text-emerald-300">{assignerCounts.completed}</strong>{' '}
                done
                {assignerCounts.blocked > 0 ? (
                  <>
                    {' · '}
                    <strong className="text-destructive">{assignerCounts.blocked}</strong> blocked
                  </>
                ) : null}
              </span>
            </div>
          ) : null}

          {filteredTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {listFilter === 'completed'
                ? 'No completed tasks yet.'
                : listFilter === 'active'
                  ? 'No active tasks — switch to Done to see finished work.'
                  : 'No tasks match this filter.'}
            </p>
          ) : compactView && isManager ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Task</th>
                    <th className="py-2 pr-3">Assigned to</th>
                    <th className="py-2 pr-3">Pipeline</th>
                    <th className="py-2 pr-3">Deadline</th>
                    <th className="py-2 pr-3">Timeline</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((t) => {
                    const isAction = needsAction(t);
                    const iAssigned = t.createdBy?.id === user?.id;
                    const assignerChip = iAssigned ? ASSIGNER_STATUS[assignerTaskStatus(t)] : null;
                    const completed = isTaskCompleted(t.status);
                    return (
                      <tr
                        key={t.id}
                        className={cn(
                          'border-b border-border/50 transition-colors',
                          t.isOverdue && !completed && 'bg-destructive/5 text-destructive',
                          isAction &&
                            !completed &&
                            'engagement-task-new bg-primary/[0.06] shadow-[inset_3px_0_0_0_hsl(var(--primary))]',
                          recentlyCompletedId === t.id && 'bg-emerald-500/10'
                        )}
                      >
                        <td className="py-2.5 pr-3 font-medium">
                          <span
                            className={cn(
                              'inline-flex max-w-full flex-col gap-1 sm:flex-row sm:items-center sm:gap-2',
                              completed && 'text-muted-foreground line-through'
                            )}
                          >
                            <span className="truncate">{t.title}</span>
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {isAction ? (
                                <span className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                                  Do now
                                </span>
                              ) : null}
                              {assignerChip ? (
                                <span
                                  className={cn(
                                    'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                                    assignerChip.className
                                  )}
                                >
                                  {assignerChip.label}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {t.assignee.firstName} {t.assignee.lastName}
                        </td>
                        <td className="py-2 pr-3">
                          {isManager && pipelineSteps.length > 0 ? (
                            <Select
                              value={t.pipelineStage ?? pipelineSteps[0]?.code ?? ''}
                              disabled={updatingTaskId === t.id}
                              onValueChange={(v) => void applyPipelineStageChange(t.id, v)}
                            >
                              <SelectTrigger className="h-8 w-[160px]">
                                <SelectValue>
                                  {t.pipelineStageLabel ?? t.pipelineStage ?? 'Stage'}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {pipelineSteps.map((s) => (
                                  <SelectItem key={s.code} value={s.code}>
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            t.pipelineStageLabel ?? t.pipelineStage ?? '—'
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {t.dueDate ? formatShortDate(t.dueDate) : '—'}
                        </td>
                        <td className="py-2 pr-3">{t.proposedTimeline || '—'}</td>
                        <td className="py-2">
                          {user?.id === t.assignee.id || isManager ? (
                            <Select
                              value={t.status === 'overdue' ? 'in_progress' : t.status}
                              disabled={updatingTaskId === t.id}
                              onValueChange={(v) =>
                                void applyStatusChange(t.id, v, t.notes || undefined)
                              }
                            >
                              <SelectTrigger className="h-8 w-[140px]">
                                <SelectValue>{statusLabel(t)}</SelectValue>
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
                            statusLabel(t)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks
                .filter((t) => !actionTasks.some((a) => a.id === t.id))
                .map((t) => (
                  <EngagementTaskCard
                    key={t.id}
                    task={t}
                    userId={user?.id}
                    isManager={Boolean(isManager)}
                    pipelineSteps={pipelineSteps}
                    actionTaskIds={actionTasks.map((a) => a.id)}
                    scrollTargetId={scrollTargetId}
                    highlightRowRef={highlightRowRef}
                    updatingTaskId={updatingTaskId}
                    recentlyCompletedId={recentlyCompletedId}
                    completingTaskId={completingTaskId}
                    onStatusChange={applyStatusChange}
                    onPipelineStageChange={isManager ? applyPipelineStageChange : undefined}
                  />
                ))}
            </div>
          )}
        </>
      )}

      <Dialog open={!!completeDialog} onOpenChange={(open) => !open && setCompleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete task</DialogTitle>
            <DialogDescription>
              Optional: add a short note for your manager before marking done.
            </DialogDescription>
          </DialogHeader>
          {completeDialog ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{completeDialog.title}</p>
              <Label htmlFor="complete-notes">Note (optional)</Label>
              <Textarea
                id="complete-notes"
                rows={3}
                placeholder="e.g. Reconciliation signed off, pending partner review"
                value={completeDialog.notes}
                onChange={(e) =>
                  setCompleteDialog({ ...completeDialog, notes: e.target.value })
                }
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog(null)}>
              Cancel
            </Button>
            <Button
              className="gap-1"
              disabled={!completeDialog || updatingTaskId === completeDialog.taskId}
              onClick={() => {
                if (!completeDialog) return;
                const { taskId, notes } = completeDialog;
                setCompleteDialog(null);
                void applyStatusChange(taskId, 'completed', notes.trim() || undefined, {
                  skipNotePrompt: true,
                });
              }}
            >
              <CheckCircle size={16} weight="fill" />
              Mark done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add task</DialogTitle>
            <DialogDescription>
              Assign a task to a member of the engagement team. Save the team on Scope &amp; team first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Task name</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Assign to</Label>
              <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={assigneeOptions.length ? 'Select staff' : 'Loading staff…'} />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No assignees available — add staff to the engagement team
                    </SelectItem>
                  ) : (
                    assigneeOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {teamStaff.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Add managers and staff to the engagement team before creating tasks.
                </p>
              )}
              {form.assigneeId && isManager && (
                <button
                  type="button"
                  className="text-xs text-primary mt-1 flex items-center gap-1"
                  onClick={() => setAvailabilityStaffId(form.assigneeId)}
                >
                  <UserCircle size={14} /> View availability
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Est. hours</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.estimatedHours}
                  onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Proposed timeline</Label>
              <Input
                placeholder="e.g. 2 days"
                value={form.proposedTimeline}
                onChange={(e) => setForm({ ...form, proposedTimeline: e.target.value })}
              />
            </div>
            {pipelineSteps.length > 0 ? (
              <div>
                <Label>Pipeline stage</Label>
                <Select
                  value={form.pipelineStage || pipelineSteps[0]?.code}
                  onValueChange={(v) => setForm({ ...form, pipelineStage: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auto from title" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelineSteps.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createTask()} disabled={!form.title || !form.assigneeId}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StaffAvailabilityPanel
        staffId={availabilityStaffId}
        open={!!availabilityStaffId}
        onClose={() => setAvailabilityStaffId(null)}
      />
    </PanelCard>
  );
}
