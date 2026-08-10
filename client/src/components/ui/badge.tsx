import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Shared metrics for status pills — 8px horizontal padding, 24px fixed height. */
export const statusBadgeMetrics =
  'inline-flex items-center justify-center h-6 min-h-6 px-2 text-xs font-medium leading-none whitespace-nowrap';

const badgeVariants = cva(
  `${statusBadgeMetrics} rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`,
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--color-brand-primary)] text-white',
        secondary: 'border-transparent bg-hover-bg text-foreground-secondary',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
