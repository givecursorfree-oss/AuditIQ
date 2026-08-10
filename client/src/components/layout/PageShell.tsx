import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Standard gutter between sidebar and page content — applied to all authenticated routes.
 */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  const { pathname } = useLocation();
  const isMessages =
    pathname === '/messages' || pathname === '/client/messages';

  if (isMessages) {
    return (
      <div className={cn('flex h-full min-h-0 w-full flex-col overflow-hidden', className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mx-auto w-full min-w-0 max-w-[1600px] flex-1 overflow-auto overflow-x-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-7',
        className
      )}
    >
      {children}
    </div>
  );
}
