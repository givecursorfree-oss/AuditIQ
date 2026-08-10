import { cn } from '@/lib/utils';

interface NavCountBadgeProps {
  count: number;
  className?: string;
  /** Collapsed sidebar: pin badge on icon corner */
  compact?: boolean;
}

function formatCount(count: number): string {
  if (count > 99) return '99+';
  if (count > 9) return '9+';
  return String(count);
}

export function NavCountBadge({ count, className, compact }: NavCountBadgeProps) {
  if (!count || count <= 0) return null;

  if (compact) {
    return (
      <span
        className={cn(
          'absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-destructive-foreground',
          className
        )}
        aria-hidden
      >
        {formatCount(count)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground',
        className
      )}
      aria-label={`${count} items need attention`}
    >
      {formatCount(count)}
    </span>
  );
}
