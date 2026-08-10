import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ErrorBanner({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive',
        className
      )}
      role="alert"
    >
      <span>{message}</span>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
