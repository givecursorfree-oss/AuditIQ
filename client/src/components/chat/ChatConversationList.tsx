import { MagnifyingGlass, PushPin, BellSlash, Archive, NotePencil } from '@phosphor-icons/react';
import UserPresenceAvatar from '../UserPresenceAvatar';
import {
  getRoomName,
  messagePreview,
  type ChatRoom,
} from '@/lib/chatHelpers';
import { normalizePresenceStatus } from '@/lib/presence';
import { cn } from '@/lib/utils';

function formatListTime(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

type Props = {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  userId: string;
  search: string;
  onSearchChange: (q: string) => void;
  onSelectRoom: (room: ChatRoom) => void;
  showArchived?: boolean;
  onToggleArchived?: () => void;
  onNewChat?: () => void;
  isClient?: boolean;
  className?: string;
};

export default function ChatConversationList({
  rooms,
  activeRoomId,
  userId,
  search,
  onSearchChange,
  onSelectRoom,
  showArchived,
  onToggleArchived,
  onNewChat,
  isClient,
  className,
}: Props) {
  const q = search.trim().toLowerCase();
  const filtered = rooms.filter((r) => {
    if (!q) return true;
    const name = getRoomName(r, userId).toLowerCase();
    const preview = messagePreview(r, userId).toLowerCase();
    return name.includes(q) || preview.includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div
      className={cn(
        'flex h-full w-full shrink-0 flex-col border-r border-border bg-background md:w-[340px] lg:w-[380px]',
        className
      )}
    >
      <div className="h-14 px-3 flex items-center justify-between border-b border-border shrink-0">
        <h2 className="text-lg font-semibold text-foreground">
          {isClient ? 'Chats' : 'Messages'}
        </h2>
        {!isClient && onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            className="p-2 rounded-full hover:bg-hover-bg text-foreground-muted hover:text-foreground transition-colors"
            title="New chat"
            aria-label="New chat"
          >
            <NotePencil size={22} weight="fill" />
          </button>
        )}
      </div>
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
          />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="input-field w-full pl-9 text-sm h-9"
          />
        </div>
        {onToggleArchived && (
          <button
            type="button"
            onClick={onToggleArchived}
            className="text-xs text-foreground-muted hover:text-foreground flex items-center gap-1"
          >
            <Archive size={14} />
            {showArchived ? 'Hide archived' : 'Archived chats'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="text-center py-8 px-4 space-y-3">
            <p className="text-sm text-foreground-muted">No conversations yet</p>
            {!isClient && onNewChat && (
              <button
                type="button"
                onClick={onNewChat}
                className="text-sm font-medium text-[var(--color-brand-primary)] hover:underline"
              >
                Start a new chat
              </button>
            )}
          </div>
        ) : (
          sorted.map((room) => {
            const active = room.id === activeRoomId;
            const other =
              room.type === 'DM'
                ? room.participants.find((p) => p.userId !== userId)?.user
                : undefined;
            const preview = messagePreview(room, userId);
            const lastAt = room.lastMessage?.createdAt || room.updatedAt;

            return (
              <button
                key={room.id}
                type="button"
                onClick={() => onSelectRoom(room)}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/50 ${
                  active ? 'bg-surface-muted' : 'hover:bg-hover-bg'
                }`}
              >
                {other ? (
                  <UserPresenceAvatar
                    userId={other.id}
                    initials={other.initials}
                    presenceStatus={normalizePresenceStatus(other.presenceStatus)}
                    size="md"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {getRoomName(room, userId).slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground truncate flex items-center gap-1">
                      {room.isPinned && <PushPin size={12} className="text-foreground-muted shrink-0" />}
                      {room.isMuted && <BellSlash size={12} className="text-foreground-muted shrink-0" />}
                      {getRoomName(room, userId)}
                    </span>
                    <span className="text-[10px] text-foreground-muted shrink-0">
                      {formatListTime(lastAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-foreground-muted truncate">{preview}</p>
                    {room.unreadCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-brand-primary)] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {room.unreadCount > 99 ? '99+' : room.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
