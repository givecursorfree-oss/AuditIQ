import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TabItem<T extends string> = {
  key: T;
  label: string;
  icon?: ElementType;
  badge?: number;
};

type AccessibleTabListProps<T extends string> = {
  tabs: TabItem<T>[];
  active: T;
  onChange: (key: T) => void;
  ariaLabel: string;
  idPrefix: string;
  className?: string;
};

export function AccessibleTabList<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  idPrefix,
  className,
}: AccessibleTabListProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              selected
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon ? <Icon size={16} aria-hidden /> : null}
            {tab.label}
            {tab.badge != null && tab.badge > 0 ? (
              <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

type AccessibleTabPanelProps = {
  id: string;
  labelledBy: string;
  hidden?: boolean;
  children: ReactNode;
  className?: string;
};

export function AccessibleTabPanel({
  id,
  labelledBy,
  hidden = false,
  children,
  className,
}: AccessibleTabPanelProps) {
  if (hidden) return null;
  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      className={className}
    >
      {children}
    </div>
  );
}
