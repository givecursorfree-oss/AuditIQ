import { useNavigate } from 'react-router-dom';
import type { DashboardStatItem } from './types';
import { NavCountBadge } from '../ui/nav-count-badge';
import { cn } from '@/lib/utils';

interface DashboardStatsCardsProps {
  stats: DashboardStatItem[];
}

export function DashboardStatsCards({ stats }: DashboardStatsCardsProps) {
  const navigate = useNavigate();
  const visible = stats.filter((s) => !s.hidden);
  if (visible.length === 0) return null;

  const cols =
    visible.length <= 2
      ? 'sm:grid-cols-2'
      : visible.length === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={`grid grid-cols-1 ${cols} gap-4`} data-onboard="dashboard-stats">
      {visible.map((stat) => {
        const interactive = Boolean(stat.navHref);
        const Tag = interactive ? 'button' : 'div';
        return (
          <Tag
            key={stat.title}
            type={interactive ? 'button' : undefined}
            onClick={interactive ? () => navigate(stat.navHref!) : undefined}
            className={cn(
              'rounded-xl border border-border bg-card p-4 sm:p-5 shadow-card text-left w-full',
              interactive && 'hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-2xl font-medium text-foreground">
                  {stat.value.toLocaleString('en-IN')}
                </p>
                {stat.changeLabel && (
                  <p className="text-xs text-muted-foreground">{stat.changeLabel}</p>
                )}
              </div>
              <div className="relative flex size-10 items-center justify-center rounded-lg border border-border bg-muted/30 shrink-0">
                <stat.icon className="size-5 text-muted-foreground" />
                {(stat.attentionCount ?? 0) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5">
                    <NavCountBadge count={stat.attentionCount!} compact className="static" />
                  </span>
                )}
              </div>
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
