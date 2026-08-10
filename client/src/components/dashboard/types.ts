import type { ElementType } from 'react';

export type EngagementRowStatus = 'in_progress' | 'completed' | 'on_hold';

export type ProjectColor = 'blue' | 'violet' | 'cyan' | 'pink' | 'amber';

export interface DashboardTaskRow {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  projectColor: ProjectColor;
  dueDate: string;
}

export interface DashboardEngagementRow {
  id: string;
  name: string;
  color: ProjectColor;
  status: EngagementRowStatus;
  progress: number;
  totalTasks: number;
  completedTasks: number;
  dueDate: string;
  ownerName: string;
  ownerInitials: string;
  ownerAvatarSeed: string;
}

export interface DashboardStatItem {
  title: string;
  value: number;
  changeLabel?: string;
  icon: ElementType;
  hidden?: boolean;
  /** Red attention badge on the stat card icon */
  attentionCount?: number;
  /** Navigate when the stat card is clicked */
  navHref?: string;
}

export interface DashboardChartPoint {
  label: string;
  value: number;
  isHighlight?: boolean;
}
