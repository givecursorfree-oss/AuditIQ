import { useMemo, useState } from 'react';
import { MagnifyingGlass, Users } from '@phosphor-icons/react';
import UserPresenceAvatar from '../UserPresenceAvatar';
import { normalizePresenceStatus, PRESENCE_LABELS } from '@/lib/presence';
import { formatRoleLabel } from '@/lib/roleLabels';
import type { ChatUser } from '@/lib/chatHelpers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: ChatUser[];
  currentUserId: string;
  loading?: boolean;
  onStartDirect: (user: ChatUser) => void | Promise<void>;
  onCreateGroup?: (users: ChatUser[], name: string) => void | Promise<void>;
};

export default function ChatNewConversationDialog({
  open,
  onOpenChange,
  users,
  currentUserId,
  loading,
  onStartDirect,
  onCreateGroup,
}: Props) {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter((u) => u.id !== currentUserId);
    if (!q) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.role && formatRoleLabel(u.role).toLowerCase().includes(q))
    );
  }, [users, currentUserId, search]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSearch('');
      setMode('direct');
      setSelected(new Set());
      setGroupName('');
    }
    onOpenChange(v);
  };

  const selectedUsers = users.filter((u) => selected.has(u.id));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border space-y-3">
          <DialogTitle className="text-left">New chat</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a person for a direct message or select members for a group chat.
          </DialogDescription>
          {onCreateGroup && (
            <div className="flex rounded-lg bg-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('direct')}
                className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
                  mode === 'direct' ? 'bg-card shadow-sm text-foreground' : 'text-foreground-muted'
                }`}
              >
                Direct message
              </button>
              <button
                type="button"
                onClick={() => setMode('group')}
                className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
                  mode === 'group' ? 'bg-card shadow-sm text-foreground' : 'text-foreground-muted'
                }`}
              >
                Group
              </button>
            </div>
          )}
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, or role"
              className="pl-9 h-9"
            />
          </div>
          {mode === 'group' && (
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name (optional)"
              className="h-9"
            />
          )}
        </DialogHeader>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-foreground-muted text-center py-10 px-4">
              {search ? 'No people match your search' : 'No contacts available to chat with'}
            </p>
          ) : (
            <ul className="py-1">
              {filtered.map((u) => {
                const isSelected = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (mode === 'direct') {
                          void onStartDirect(u);
                          handleClose(false);
                        } else {
                          toggleSelect(u.id);
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-hover-bg transition-colors ${
                        isSelected ? 'bg-surface-muted' : ''
                      }`}
                    >
                      {mode === 'group' && (
                        <span
                          className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                            isSelected
                              ? 'bg-[var(--color-brand-primary)] border-[var(--color-brand-primary)] text-white'
                              : 'border-border'
                          }`}
                        >
                          {isSelected && <span className="text-[10px]">✓</span>}
                        </span>
                      )}
                      <UserPresenceAvatar
                        userId={u.id}
                        initials={u.initials}
                        presenceStatus={normalizePresenceStatus(u.presenceStatus)}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                        <p className="text-xs text-foreground-muted truncate">
                          {u.role ? formatRoleLabel(u.role) : u.email}
                          {' · '}
                          {PRESENCE_LABELS[normalizePresenceStatus(u.presenceStatus)]}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {mode === 'group' && onCreateGroup && (
          <div className="p-4 border-t border-border flex items-center justify-between gap-2">
            <p className="text-xs text-foreground-muted">
              {selected.size === 0
                ? 'Select people for the group'
                : `${selected.size} selected`}
            </p>
            <Button
              size="sm"
              disabled={selected.size < 2}
              onClick={() => {
                void onCreateGroup(
                  selectedUsers,
                  groupName.trim() || `Group (${selected.size + 1})`
                );
                handleClose(false);
              }}
            >
              <Users size={16} className="mr-1" />
              Create group
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
