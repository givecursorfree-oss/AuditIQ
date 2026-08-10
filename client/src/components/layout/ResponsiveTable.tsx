import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveTableProps {
  children: ReactNode;
  className?: string;
  minWidthClass?: string;
}

/** Horizontal scroll wrapper for wide data tables on small screens. */
export function ResponsiveTable({
  children,
  className,
  minWidthClass = 'min-w-[640px]',
}: ResponsiveTableProps) {
  return (
    <div className={cn('card overflow-hidden -mx-1 sm:mx-0', className)}>
      <div className="overflow-x-auto overscroll-x-contain">
        <div className={cn('w-full', minWidthClass)}>{children}</div>
      </div>
    </div>
  );
}
