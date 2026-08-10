import { useState } from 'react';
import { MagnifyingGlass, ChatCircle, UserPlus } from '@phosphor-icons/react';
import UserPresenceAvatar from '../UserPresenceAvatar';
import { normalizePresenceStatus, PRESENCE_LABELS } from '@/lib/presence';
import { formatRoleLabel } from '@/lib/roleLabels';
import { getRoomName, messagePreview, type ChatRoom, type ChatUser } from '@/lib/chatHelpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  isClient: boolean;
  userId: string;
  rooms: ChatRoom[];
  contacts: ChatUser[];
  contactsLoading?: boolean;
  onOpenNewChat: () => void;
  onSelectRoom: (room: ChatRoom) => void;
  onStartDirect: (user: ChatUser) => void;
};

export default function ChatStartPanel({
  isClient,
  userId,
  rooms,
  contacts,
  contactsLoading,
  onOpenNewChat,
  onSelectRoom,
  onStartDirect,
}: Props) {
  const engagementRooms = rooms.filter((r) => r.engagementId || r.type === 'CHANNEL');

  if (isClient) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-background">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center max-w-md mx-auto">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
            <ChatCircle size={48} className="text-foreground-muted opacity-40" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">AuditIQ Messages</h2>
          <p className="text-sm text-foreground-muted mb-6">
            Chat with your audit team on each engagement. Select a channel from the list on the
            left.
          </p>
        </div>
        {engagementRooms.length > 0 && (
          <div className="border-t border-border px-4 py-3 max-h-[40%] overflow-y-auto">
            <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wide mb-2">
              Your engagement channels
            </p>
            <ul className="space-y-1">
              {engagementRooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => onSelectRoom(room)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-hover-bg text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {getRoomName(room, userId).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{getRoomName(room, userId)}</p>
                      <p className="text-xs text-foreground-muted truncate">
                        {messagePreview(room, userId)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-5 border-b border-border bg-background shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Start a conversation</h2>
        <p className="text-sm text-foreground-muted mt-1">
          Send a message to a colleague or client on your engagements.
        </p>
        <Button className="mt-4 gap-2" onClick={onOpenNewChat}>
          <UserPlus size={18} weight="bold" />
          New chat
        </Button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 px-4 py-3">
        <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wide mb-2">
          People you can message
        </p>
        <ContactQuickList
          contacts={contacts}
          loading={contactsLoading}
          currentUserId={userId}
          onPick={onStartDirect}
        />
      </div>
    </div>
  );
}

function ContactQuickList({
  contacts,
  loading,
  currentUserId,
  onPick,
}: {
  contacts: ChatUser[];
  loading?: boolean;
  currentUserId: string;
  onPick: (u: ChatUser) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = contacts
    .filter((u) => u.id !== currentUserId)
    .filter((u) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        u.name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        (u.role && formatRoleLabel(u.role).toLowerCase().includes(s))
      );
    });

  return (
    <>
      <div className="relative mb-2 shrink-0">
        <MagnifyingGlass
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people"
          className="pl-9 h-9"
        />
      </div>
      <div className="flex-1 overflow-y-auto -mx-1">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-foreground-muted text-center py-8">
            {q ? 'No matches' : 'Loading contacts…'}
          </p>
        ) : (
          <ul>
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onPick(u)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-hover-bg text-left"
                >
                  <UserPresenceAvatar
                    userId={u.id}
                    initials={u.initials}
                    presenceStatus={normalizePresenceStatus(u.presenceStatus)}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{u.name}</p>
                    <p className="text-xs text-foreground-muted">
                      {u.role ? formatRoleLabel(u.role) : u.email}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
