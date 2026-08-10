import type { ElementType } from 'react';
import {
  ClipboardList,
  CheckSquare,
  GitBranch,
  FileText,
  MessageSquare,
  Users,
  CalendarClock,
  ListTodo,
  AlertTriangle,
  Sparkles,
  Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { PanelCard } from '../layout/PanelCard';
import type { NavBadges } from '@/lib/navBadgeMap';
import { NavCountBadge } from '../ui/nav-count-badge';
import { engagementHubPath } from '@/lib/engagementDeepLinks';

type PriorityCard = {
  id: string;
  label: string;
  detail?: string;
  count: number;
  href: string;
  icon: ElementType;
  urgent?: boolean;
};

interface DashboardPrioritiesProps {
  role: string;
  badges: NavBadges;
  tasksDueToday: number;
  overdueDeadlines: number;
  briefingSummary?: {
    atRiskCount?: number;
    pendingDocsCount?: number;
    udinPendingCount?: number;
  } | null;
  firstAtRiskEngagementId?: string | null;
}

const LEADERSHIP = ['Admin', 'Partner', 'Manager'];
const FIRM_STAFF = ['Admin', 'Partner', 'Manager', 'Staff', 'Intern'];

function buildCards({
  role,
  badges,
  tasksDueToday,
  overdueDeadlines,
  briefingSummary,
  firstAtRiskEngagementId,
}: DashboardPrioritiesProps): PriorityCard[] {
  const cards: PriorityCard[] = [];
  const isLeadership = LEADERSHIP.includes(role);
  const isStaff = FIRM_STAFF.includes(role);

  if (isLeadership && badges.pendingClientRequests > 0) {
    cards.push({
      id: 'requests',
      label: 'Client requests',
      detail: 'Approve or assign team',
      count: badges.pendingClientRequests,
      href: '/requests',
      icon: ClipboardList,
      urgent: true,
    });
  }

  if (isLeadership && badges.lettersNeedingTeam > 0) {
    cards.push({
      id: 'letters',
      label: 'Letters signed',
      detail: 'Assign partner & team',
      count: badges.lettersNeedingTeam,
      href: '/requests',
      icon: Users,
      urgent: true,
    });
  }

  if (isStaff && badges.approvals > 0) {
    cards.push({
      id: 'approvals',
      label: 'Approvals',
      detail: 'Waiting on you',
      count: badges.approvals,
      href: '/approvals?view=pending',
      icon: CheckSquare,
      urgent: true,
    });
  }

  if (isLeadership && (briefingSummary?.atRiskCount ?? 0) > 0) {
    cards.push({
      id: 'at-risk',
      label: 'At-risk engagements',
      detail: 'Review workflow',
      count: briefingSummary!.atRiskCount!,
      href: firstAtRiskEngagementId
        ? engagementHubPath(firstAtRiskEngagementId, 'workflow')
        : '/engagements?status=Active',
      icon: AlertTriangle,
      urgent: true,
    });
  }

  if (badges.openClientQueries > 0) {
    cards.push({
      id: 'queries',
      label: 'Client queries',
      detail: 'Needs response',
      count: badges.openClientQueries,
      href: '/engagements',
      icon: MessageSquare,
      urgent: true,
    });
  }

  if ((briefingSummary?.pendingDocsCount ?? 0) > 0 || badges.pendingDocuments > 0) {
    const count = Math.max(briefingSummary?.pendingDocsCount ?? 0, badges.pendingDocuments);
    cards.push({
      id: 'pending-docs',
      label: 'Pending documents',
      detail: 'Client submissions',
      count,
      href: '/documents',
      icon: FileText,
    });
  }

  if (badges.workflowAttention > 0) {
    cards.push({
      id: 'workflow',
      label: 'Engagements',
      detail: 'Workflow attention',
      count: badges.workflowAttention,
      href: '/engagements',
      icon: GitBranch,
    });
  }

  if (isLeadership && badges.incomingClients > 0) {
    cards.push({
      id: 'incoming',
      label: 'Incoming clients',
      detail: 'Review & onboard',
      count: badges.incomingClients,
      href: '/clients?tab=incoming',
      icon: Users,
    });
  }

  if (badges.pendingLeaves > 0 && isLeadership) {
    cards.push({
      id: 'leave',
      label: 'Leave requests',
      count: badges.pendingLeaves,
      href: '/leave-stipend?tab=inbox',
      icon: CalendarClock,
    });
  }

  if (tasksDueToday > 0) {
    cards.push({
      id: 'tasks-today',
      label: 'Tasks due today',
      count: tasksDueToday,
      href: '/engagements',
      icon: ListTodo,
      urgent: tasksDueToday > 0,
    });
  }

  if (overdueDeadlines > 0) {
    cards.push({
      id: 'overdue',
      label: 'Overdue deadlines',
      count: overdueDeadlines,
      href: '/compliance-calendar',
      icon: CalendarClock,
      urgent: true,
    });
  }

  if ((briefingSummary?.udinPendingCount ?? 0) > 0) {
    cards.push({
      id: 'udin',
      label: 'UDIN pending',
      count: briefingSummary!.udinPendingCount!,
      href: '/engagements',
      icon: AlertTriangle,
    });
  }

  return cards;
}

function buildShortcutCards(role: string): PriorityCard[] {
  const cards: PriorityCard[] = [
    {
      id: 'engagements',
      label: 'Engagements',
      detail: 'Open your audit files',
      count: 0,
      href: '/engagements',
      icon: GitBranch,
    },
    {
      id: 'approvals-shortcut',
      label: 'Approvals',
      detail: 'Review pending sign-offs',
      count: 0,
      href: '/approvals?view=pending',
      icon: CheckSquare,
    },
  ];

  if (role === 'Intern') {
    cards.push(
      {
        id: 'time',
        label: 'Time & billing',
        detail: 'Log hours or view timesheets',
        count: 0,
        href: '/time-tracker',
        icon: Clock,
      },
      {
        id: 'stipend',
        label: 'Stipend',
        detail: 'View stipend and leave',
        count: 0,
        href: '/leave-stipend?tab=stipend',
        icon: CalendarClock,
      }
    );
  } else if (FIRM_STAFF.includes(role)) {
    cards.push(
      {
        id: 'documents-shortcut',
        label: 'Document library',
        detail: 'Firm templates and uploads',
        count: 0,
        href: '/documents',
        icon: FileText,
      },
      {
        id: 'time',
        label: 'Time & billing',
        detail: 'Log hours or view timesheets',
        count: 0,
        href: '/time-tracker',
        icon: Clock,
      }
    );
  }

  return cards;
}

export function DashboardPriorities(props: DashboardPrioritiesProps) {
  const navigate = useNavigate();
  const cards = buildCards(props);
  const shortcuts = buildShortcutCards(props.role);
  const display = cards.length > 0 ? cards : shortcuts;

  return (
    <div data-onboard="dashboard-priorities">
    <PanelCard title="What needs your attention" className="border-primary/20 bg-primary/[0.02]">
      {cards.length === 0 && (
        <p className="flex items-center gap-2 px-4 pb-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          You&apos;re all caught up. Jump to any area below.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {display.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => navigate(card.href)}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left shadow-card transition-colors',
                'hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                card.urgent
                  ? 'border-primary/30 bg-card'
                  : 'border-border bg-card'
              )}
            >
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg border',
                  card.urgent ? 'border-primary/25 bg-primary/10' : 'border-border bg-muted/30'
                )}
              >
                <Icon className={cn('size-4', card.urgent ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{card.label}</p>
                {card.detail ? (
                  <p className="truncate text-xs text-muted-foreground">{card.detail}</p>
                ) : null}
              </div>
              {card.count > 0 ? (
                <NavCountBadge count={card.count} className="!ml-0 shrink-0" />
              ) : null}
            </button>
          );
        })}
      </div>
    </PanelCard>
    </div>
  );
}
