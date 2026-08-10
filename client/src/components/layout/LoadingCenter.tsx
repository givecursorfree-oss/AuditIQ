import { CircleNotch } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export function LoadingCenter({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground', className)}>
      <CircleNotch size={24} className="animate-spin text-primary" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}
