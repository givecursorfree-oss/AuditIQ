import { CaretDown as ChevronDown } from '@phosphor-icons/react';
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePresence } from '@/context/PresenceContext';
import { useAuth } from '@/context/AuthContext';
import {
  isStaffPresenceRole,
  PRESENCE_LABELS,
  PRESENCE_STATUSES,
  type PresenceStatus,
} from '@/lib/presence';
import { cn } from '@/lib/utils';

export default function StaffPresenceSelector({ className }: { className?: string }) {
  const { user } = useAuth();
  const { myStatus, setMyStatus, updating } = usePresence();

  if (!user || !isStaffPresenceRole(user.role)) return null;

  const pick = async (status: PresenceStatus) => {
    if (status === myStatus || updating) return;
    await setMyStatus(status);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1.5',
            'hover:bg-hover-bg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            updating && 'opacity-60 pointer-events-none',
            className
          )}
          aria-label="Update your status"
        >
          <Status status={myStatus} className="border-0 bg-transparent px-0 py-0 shadow-none">
            <StatusIndicator />
            <StatusLabel>{PRESENCE_LABELS[myStatus]}</StatusLabel>
          </Status>
          <ChevronDown size={14} className="text-foreground-muted shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {PRESENCE_STATUSES.map((status) => (
          <DropdownMenuItem
            key={status}
            onClick={() => pick(status)}
            className={cn('flex items-center gap-2 cursor-pointer', myStatus === status && 'bg-accent')}
          >
            <Status status={status} className="border-0 bg-transparent px-0 py-0 shadow-none">
              <StatusIndicator />
              <StatusLabel>{PRESENCE_LABELS[status]}</StatusLabel>
            </Status>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
