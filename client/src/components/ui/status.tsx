import type { ComponentProps, HTMLAttributes } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PresenceStatus } from '@/lib/presence';

export type StatusProps = ComponentProps<typeof Badge> & {
  status: PresenceStatus;
};

export const Status = ({ className, status, ...props }: StatusProps) => (
  <Badge
    className={cn('flex items-center gap-2', 'group', status, className)}
    variant="secondary"
    {...props}
  />
);

export type StatusIndicatorProps = HTMLAttributes<HTMLSpanElement>;

export const StatusIndicator = ({ className, ...props }: StatusIndicatorProps) => (
  <span className={cn('relative flex h-2 w-2', className)} {...props}>
    <span
      className={cn(
        'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
        'group-[.online]:bg-emerald-500',
        'group-[.offline]:bg-red-500',
        'group-[.maintenance]:bg-blue-500',
        'group-[.degraded]:bg-amber-500'
      )}
    />
    <span
      className={cn(
        'relative inline-flex h-2 w-2 rounded-full',
        'group-[.online]:bg-emerald-500',
        'group-[.offline]:bg-red-500',
        'group-[.maintenance]:bg-blue-500',
        'group-[.degraded]:bg-amber-500'
      )}
    />
  </span>
);

export type StatusLabelProps = HTMLAttributes<HTMLSpanElement>;

export const StatusLabel = ({ className, children, ...props }: StatusLabelProps) => (
  <span className={cn('text-muted-foreground', className)} {...props}>
    {children}
  </span>
);
