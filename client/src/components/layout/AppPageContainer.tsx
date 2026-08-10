import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AppPageContainerProps {
  children: ReactNode;
  className?: string;
}

/** Matches dashboard-5 DashboardContent scroll area padding. */
export function AppPageContainer({ children, className }: AppPageContainerProps) {
  return (
    <div className={cn('w-full min-w-0 space-y-5 sm:space-y-6', className)}>
      {children}
    </div>
  );
}
