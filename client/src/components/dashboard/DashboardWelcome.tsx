import { Download, Plus, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NavCountBadge } from '../ui/nav-count-badge';
import PageHeader from '../layout/PageHeader';
import { requestTourReplay } from '@/lib/productTour';

interface DashboardWelcomeProps {
  userName: string;
  tasksDueToday: number;
  overdueTasks: number;
  upcomingDeadlines: number;
  attentionCount?: number;
  showAttentionBadge?: boolean;
  onExport?: () => void;
  onNew?: () => void;
  showActions?: boolean;
}

export function DashboardWelcome({
  userName,
  tasksDueToday,
  overdueTasks,
  upcomingDeadlines,
  attentionCount = 0,
  showAttentionBadge = true,
  onExport,
  onNew,
  showActions = true,
}: DashboardWelcomeProps) {
  const description = `${tasksDueToday} tasks due today · ${overdueTasks} overdue · ${upcomingDeadlines} upcoming this week`;

  return (
    <div data-onboard="dashboard-welcome">
      <PageHeader
        className="mb-4 sm:mb-6"
        title={`Welcome back, ${userName}`}
        description={description}
        badge={
          showAttentionBadge && attentionCount > 0 ? (
            <NavCountBadge count={attentionCount} className="ml-0" />
          ) : undefined
        }
        actions={
          showActions ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => requestTourReplay()}
              >
                <Compass className="size-4" aria-hidden />
                Take tour
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onExport}>
                <Download className="size-4" aria-hidden />
                Export
              </Button>
              <Button size="sm" className="h-9 gap-1.5" onClick={onNew}>
                <Plus className="size-4" aria-hidden />
                New
              </Button>
            </>
          ) : undefined
        }
      />
    </div>
  );
}
