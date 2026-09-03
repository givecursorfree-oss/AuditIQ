import { cn } from '@/lib/utils';
import { claimStaffTimelineEvents, type StaffClaimRow } from '@/lib/expenseClaims';

export function ClaimStaffTimeline({ claim }: { claim: StaffClaimRow }) {
  const events = claimStaffTimelineEvents(claim);

  return (
    <ol className="mt-2 space-y-0 border-l border-border ml-1.5">
      {events.map((ev, i) => (
        <li key={ev.key} className="relative pl-4 pb-2 last:pb-0">
          <span
            className={cn(
              'absolute -left-[5px] top-1 size-2.5 rounded-full border-2 bg-card',
              ev.state === 'done' && 'border-primary bg-primary',
              ev.state === 'current' && 'border-primary',
              ev.state === 'upcoming' && 'border-border',
              ev.state === 'rejected' && 'border-destructive bg-destructive'
            )}
          />
          <p
            className={cn(
              'text-xs font-medium',
              ev.state === 'current' && 'text-foreground',
              ev.state === 'upcoming' && 'text-muted-foreground',
              ev.state === 'rejected' && 'text-destructive'
            )}
          >
            {ev.label}
          </p>
          {ev.detail ? <p className="text-[10px] text-muted-foreground">{ev.detail}</p> : null}
          {i < events.length - 1 ? null : null}
        </li>
      ))}
    </ol>
  );
}
