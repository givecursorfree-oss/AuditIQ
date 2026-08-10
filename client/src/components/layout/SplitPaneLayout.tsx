import type { ReactNode } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface SplitPaneLayoutProps {
  list: ReactNode;
  detail: ReactNode;
  /** When true, mobile shows detail only; desktop shows both panes. */
  hasSelection: boolean;
  onClearSelection?: () => void;
  backLabel?: string;
  listWidthClass?: string;
  className?: string;
}

/**
 * Master–detail layout: stacked on mobile, side-by-side from lg breakpoint.
 */
export function SplitPaneLayout({
  list,
  detail,
  hasSelection,
  onClearSelection,
  backLabel = 'Back to list',
  listWidthClass = 'lg:w-80',
  className,
}: SplitPaneLayoutProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row', className)}>
      <div
        className={cn(
          'flex w-full flex-col border-border lg:shrink-0 lg:border-r',
          listWidthClass,
          hasSelection ? 'hidden lg:flex' : 'flex max-h-[48vh] lg:max-h-none'
        )}
      >
        {list}
      </div>
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          !hasSelection && 'hidden lg:flex'
        )}
      >
        {hasSelection && onClearSelection && (
          <div className="shrink-0 border-b border-border px-3 py-2 lg:hidden">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 px-2 text-foreground-muted"
              onClick={onClearSelection}
            >
              <ArrowLeft size={16} />
              {backLabel}
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div>
      </div>
    </div>
  );
}
