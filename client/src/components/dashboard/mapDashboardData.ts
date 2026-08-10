import {
  Briefcase,
  Users,
  Eye,
  CheckCircle2,
  ListTodo,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import type { ElementType } from 'react';
import type { Engagement, Deadline, DashboardData } from '@/types';
import type {
  DashboardChartPoint,
  DashboardEngagementRow,
  DashboardStatItem,
  DashboardTaskRow,
  EngagementRowStatus,
  ProjectColor,
} from './types';

const COLORS: ProjectColor[] = ['blue', 'violet', 'cyan', 'pink', 'amber'];

const STATUS_PROGRESS: Record<string, number> = {
  Planning: 15,
  Fieldwork: 45,
  'Under Review': 70,
  Reporting: 85,
  Closed: 100,
};

function mapEngagementStatus(status: string): EngagementRowStatus {
  if (status === 'Closed') return 'completed';
  if (status === 'Reporting') return 'on_hold';
  return 'in_progress';
}

function formatDashboardDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** DB `progress` defaults to 0 — use status-based % when unset */
function resolveEngagementProgress(eng: Engagement): number {
  const stored = eng.progress;
  if (stored != null && stored > 0) return Math.min(100, Math.max(0, stored));
  return STATUS_PROGRESS[eng.status] ?? 15;
}

export function buildEngagementRows(engagements: Engagement[]): DashboardEngagementRow[] {
  return engagements.map((eng, index) => {
    const lead = eng.members?.[0]?.user;
    const ownerName = lead
      ? `${lead.firstName} ${lead.lastName}`.trim()
      : eng.client?.name || 'Unassigned';
    const ownerInitials =
      lead?.initials ||
      ownerName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const ownerAvatarSeed = lead
      ? `${lead.firstName}-${lead.lastName}`
      : eng.client?.name || eng.id;
    const wp = eng._count?.workpapers ?? 0;
    const docs = eng._count?.documents ?? 0;
    const obs = (eng._count as { observations?: number })?.observations ?? 0;
    const totalTasks = Math.max(wp + docs + obs, 1);
    const progress = resolveEngagementProgress(eng);
    const completedTasks = Math.min(totalTasks, Math.max(1, Math.round((progress / 100) * totalTasks)));

    return {
      id: eng.id,
      name: eng.title,
      color: COLORS[index % COLORS.length],
      status: mapEngagementStatus(eng.status),
      progress,
      totalTasks,
      completedTasks,
      dueDate: formatDashboardDate(eng.deadline),
      ownerName,
      ownerInitials,
      ownerAvatarSeed,
    };
  });
}

export function buildTaskRows(
  tasks: {
    id: string;
    title: string;
    dueDate?: string;
    engagement?: { id: string; title: string };
    priority?: string;
  }[],
  deadlines: Deadline[] = []
): DashboardTaskRow[] {
  const fromTasks: DashboardTaskRow[] = tasks.map((task, index) => ({
    id: task.id,
    name: task.title,
    projectId: task.engagement?.id || 'general',
    projectName: task.engagement?.title || 'General',
    projectColor: COLORS[index % COLORS.length],
    dueDate: formatDashboardDate(task.dueDate),
  }));

  if (fromTasks.length > 0) return fromTasks;

  return deadlines.slice(0, 8).map((dl, index) => ({
    id: dl.id,
    name: dl.title,
    projectId: dl.engagementId,
    projectName: dl.engagement?.title || 'Engagement',
    projectColor: COLORS[index % COLORS.length],
    dueDate: formatDashboardDate(dl.dueDate),
  }));
}

export function buildChartPoints(
  chartData: { month: string; completed: number; active: number }[]
): DashboardChartPoint[] {
  const points = chartData.map((row) => ({
    label: row.month,
    value: row.active + row.completed,
  }));
  if (points.length === 0) return points;
  const max = Math.max(...points.map((p) => p.value));
  return points.map((p) => ({ ...p, isHighlight: p.value === max && max > 0 }));
}

export function buildPerformanceMetrics(
  chartData: { month: string; completed: number; active: number }[],
  stats?: DashboardData['stats']
): { score: number; changeLabel: string } {
  const totalActive = stats?.activeEngagements ?? 0;
  const totalAll = (stats?.totalEngagements ?? totalActive) || 1;
  const score = Math.min(100, Math.round((totalActive / totalAll) * 100));

  if (chartData.length >= 2) {
    const last = chartData[chartData.length - 1];
    const prev = chartData[chartData.length - 2];
    const lastVal = last.active + last.completed;
    const prevVal = prev.active + prev.completed;
    const delta = prevVal > 0 ? Math.round(((lastVal - prevVal) / prevVal) * 100) : 0;
    const sign = delta >= 0 ? '+' : '';
    return { score, changeLabel: `${sign}${delta}% vs last month` };
  }

  return { score, changeLabel: '+0% vs last month' };
}

export function countTasksDueToday(tasks: { dueDate?: string }[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d >= today && d < tomorrow;
  }).length;
}

export function countUpcomingDeadlinesThisWeek(deadlines: Deadline[]): number {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return deadlines.filter((d) => {
    const due = new Date(d.dueDate);
    return due >= now && due <= weekEnd && !d.isOverdue;
  }).length;
}

function momFromSeries(values: number[]): string | undefined {
  if (values.length < 2) return undefined;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  if (prev === 0) return undefined;
  const delta = Math.round(((last - prev) / prev) * 100);
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta} vs last month`;
}

export function buildStatCards(
  stats: DashboardData['stats'] | undefined,
  engagementsByStatus: Record<string, number> | undefined,
  chartData: { month: string; completed: number; active: number }[],
  options: { isClient: boolean; isIntern: boolean; showClients: boolean }
): DashboardStatItem[] {
  const inReview = engagementsByStatus?.['Under Review'] ?? 0;
  const closed = engagementsByStatus?.Closed ?? 0;
  const activitySeries = chartData.map((r) => r.active + r.completed);
  const momActivity = momFromSeries(activitySeries);

  return [
    {
      title: 'Total Clients',
      value: stats?.totalClients ?? 0,
      changeLabel: momActivity,
      icon: Users as ElementType,
      hidden: options.isClient || !options.showClients,
    },
    {
      title: 'Total Projects',
      value: stats?.activeEngagements ?? 0,
      changeLabel: momActivity,
      icon: Briefcase as ElementType,
    },
    {
      title: 'In Reviews',
      value: inReview,
      changeLabel: momFromSeries(chartData.map((r) => r.active)),
      icon: Eye as ElementType,
      hidden: options.isIntern,
    },
    {
      title: 'Completed Tasks',
      value: closed,
      changeLabel: momFromSeries(chartData.map((r) => r.completed)),
      icon: CheckCircle2 as ElementType,
      hidden: options.isClient,
    },
    {
      title: 'Overdue Deadlines',
      value: stats?.overdueDeadlines ?? 0,
      changeLabel: stats?.overdueDeadlines ? 'Requires attention' : undefined,
      icon: AlertTriangle as ElementType,
      hidden: options.isClient || options.isIntern,
    },
    {
      title: 'Open Tasks',
      value: stats?.openClientQueries ?? 0,
      changeLabel: 'Client queries pending',
      icon: ListTodo as ElementType,
      hidden: !stats?.openClientQueries,
    },
    {
      title: 'Hours This Month',
      value: stats?.monthlyHours ?? 0,
      changeLabel: 'Logged this month',
      icon: Clock as ElementType,
      hidden: options.isClient,
    },
  ];
}
