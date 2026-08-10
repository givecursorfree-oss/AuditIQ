import { CaretUp, Check } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { usePresence } from '../../context/PresenceContext';
import { formatRoleLabel, formatStaffTitle } from '../../lib/roleLabels';
import {
  isStaffPresenceRole,
  PRESENCE_LABELS,
  PRESENCE_STATUSES,
  type PresenceStatus,
} from '../../lib/presence';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Status, StatusIndicator, StatusLabel } from '../ui/status';
import { SidebarMenuButton } from '../ui/sidebar';
import { GradientAvatar } from '../ui/gradient-avatar';
import { cn } from '../../lib/utils';

const presenceDotClass: Record<PresenceStatus, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-red-500',
  maintenance: 'bg-blue-500',
  degraded: 'bg-amber-500',
};

export default function SidebarUserMenu({ className }: { className?: string }) {
  const { user } = useAuth();
  const { myStatus, setMyStatus, updating } = usePresence();

  if (!user) return null;

  const isClientUser = user.role === 'Client';
  const canChangePresence = isStaffPresenceRole(user.role);
  const statusLabel = PRESENCE_LABELS[myStatus];
  const subtitle = canChangePresence
    ? statusLabel
    : formatStaffTitle(user);

  const pickStatus = async (status: PresenceStatus) => {
    if (!canChangePresence || status === myStatus || updating) return;
    await setMyStatus(status);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip={`${user.firstName} ${user.lastName} — ${statusLabel}`}
          className={cn(
            'cursor-pointer data-[state=open]:bg-sidebar-accent w-full',
            updating && 'opacity-60 pointer-events-none',
            isClientUser &&
              'h-auto justify-center rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3',
            className
          )}
        >
          <div
            className={cn(
              'flex min-w-0 items-center group-data-[collapsible=icon]:hidden',
              isClientUser ? 'w-full justify-center gap-3' : 'w-full gap-2.5'
            )}
          >
            <div className="relative shrink-0">
              <GradientAvatar
                seed={`${user.firstName}-${user.lastName}`}
                initials={user.initials}
                size="lg"
                className="rounded-lg"
              />
              {canChangePresence && (
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar',
                    presenceDotClass[myStatus]
                  )}
                  aria-hidden
                />
              )}
            </div>
            <div
              className={cn(
                'min-w-0 text-sm leading-tight',
                isClientUser ? 'text-center' : 'grid flex-1 text-left'
              )}
            >
              <span className="truncate font-semibold text-sidebar-foreground">
                {user.firstName} {user.lastName}
              </span>
              <span
                className={cn(
                  'truncate text-xs text-sidebar-muted',
                  isClientUser ? 'flex justify-center' : 'flex items-center gap-1'
                )}
              >
                {canChangePresence && (
                  <span
                    className={cn('inline-block size-1.5 rounded-full shrink-0', presenceDotClass[myStatus])}
                    aria-hidden
                  />
                )}
                {subtitle}
              </span>
            </div>
            {canChangePresence && (
              <CaretUp
                size={14}
                className="text-sidebar-muted shrink-0"
                aria-hidden
              />
            )}
          </div>
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-56"
      >
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-semibold text-foreground">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-foreground-muted truncate">{user.email}</p>
        </DropdownMenuLabel>

        {canChangePresence ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-foreground-muted font-medium">
              Your status
            </DropdownMenuLabel>
            {PRESENCE_STATUSES.map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() => pickStatus(status)}
                className="flex items-center justify-between gap-2 cursor-pointer"
              >
                <Status
                  status={status}
                  className="border-0 bg-transparent px-0 py-0 shadow-none"
                >
                  <StatusIndicator />
                  <StatusLabel className="text-foreground">
                    {PRESENCE_LABELS[status]}
                  </StatusLabel>
                </Status>
                {myStatus === status && (
                  <Check size={14} className="text-primary shrink-0" weight="bold" />
                )}
              </DropdownMenuItem>
            ))}
          </>
        ) : (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-foreground-muted">
              {formatRoleLabel(user.role)}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
