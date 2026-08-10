import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  bodyClassName?: string;
}

export function PanelCard({ children, className, title, action, bodyClassName }: PanelCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card shadow-card overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-border">
          {title && <h3 className="font-medium text-base text-foreground">{title}</h3>}
          {action}
        </div>
      )}
      <div className={cn('px-4 py-4', bodyClassName)}>{children}</div>
    </div>
  );
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  className,
  valueClassName,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 shadow-card', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className={cn('text-lg sm:text-xl font-semibold text-foreground truncate', valueClassName)}>
            {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
          </p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/30 shrink-0">
            <Icon className="size-5 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
