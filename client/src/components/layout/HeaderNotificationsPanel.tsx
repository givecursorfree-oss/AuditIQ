import {
  Bell,
  CheckCheck,
  ClipboardList,
  FileText,
  PenLine,
  UserPlus,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { teamAssignmentPath } from '@/lib/teamAssignmentRoutes';
import { LoadingCenter, EmptyState } from './StatePanels';
import { cn } from '@/lib/utils';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  link?: string | null;
}

function notificationVisual(n: AppNotification): { Icon: LucideIcon; accent: string } {
  const title = n.title.toLowerCase();
  if (title.includes('letter signed')) {
    return { Icon: PenLine, accent: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' };
  }
  if (title.includes('service request') || title.includes('client request')) {
    return { Icon: ClipboardList, accent: 'text-primary bg-primary/10 border-primary/20' };
  }
  if (title.includes('assigned')) {
    return { Icon: UserPlus, accent: 'text-violet-600 bg-violet-500/10 border-violet-500/20' };
  }
  if (title.includes('letter') || title.includes('approved')) {
    return { Icon: FileText, accent: 'text-amber-600 bg-amber-500/10 border-amber-500/20' };
  }
  if (title.includes('engagement')) {
    return { Icon: Briefcase, accent: 'text-muted-foreground bg-muted/40 border-border' };
  }
  return { Icon: Bell, accent: 'text-muted-foreground bg-muted/40 border-border' };
}

import { safeInAppPath } from '@/lib/safeNavigation';

/** Resolve deep links — signed letters always open team assignment. */
export function resolveNotificationLink(n: AppNotification): string | null {
  if (!n.link) return null;
  if (n.title.toLowerCase().includes('letter signed')) {
    const fromQuery = n.link.match(/engagementId=([^&]+)/)?.[1];
    if (fromQuery) return teamAssignmentPath(fromQuery);
    const fromPath = n.link.match(/^\/engagements\/([^/]+)/)?.[1];
    if (fromPath) return teamAssignmentPath(fromPath);
  }
  return safeInAppPath(n.link);
}

interface HeaderNotificationsPanelProps {
  notifications: AppNotification[];
  loading: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onOpen: (notification: AppNotification) => void;
}

export function HeaderNotificationsPanel({
  notifications,
  loading,
  unreadCount,
  onMarkAllRead,
  onOpen,
}: HeaderNotificationsPanelProps) {
  const listUnread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/20">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          {listUnread > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {listUnread} unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 rounded-sm"
            aria-label="Mark all notifications as read"
          >
            <CheckCheck className="size-3.5" aria-hidden />
            Mark all read
          </button>
        )}
      </div>
      {loading ? (
        <div className="max-h-[min(20rem,70vh)] overflow-y-auto overscroll-contain">
          <LoadingCenter label="Loading notifications…" className="py-10" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="max-h-[min(20rem,70vh)] overflow-y-auto overscroll-contain">
          <EmptyState
            title="No notifications yet"
            description="Updates about requests, letters, and assignments appear here."
            className="py-10 px-4"
          />
        </div>
      ) : (
        <ul
          className="max-h-[min(20rem,70vh)] overflow-y-auto overscroll-contain p-2 space-y-1.5"
          aria-label="Notification list"
        >
            {notifications.map((n) => {
              const { Icon, accent } = notificationVisual(n);
              const when = formatRelativeTime(n.createdAt);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(n)}
                    className={cn(
                      'w-full text-left rounded-lg border px-3 py-2.5 transition-colors',
                      'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                      n.isRead
                        ? 'border-transparent bg-transparent'
                        : 'border-border bg-primary/5 shadow-card'
                    )}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg border',
                          accent
                        )}
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground line-clamp-1">{n.title}</p>
                          {!n.isRead && (
                            <span
                              className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        {when && (
                          <p className="text-[11px] text-muted-foreground/80 mt-1.5 tabular-nums">{when}</p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
