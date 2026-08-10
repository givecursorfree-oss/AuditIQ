import { useCallback, useEffect, useRef } from 'react';
import {
  PushPin as Pin,
  PushPinSimple,
  X,
  Users,
  Hash,
  MagnifyingGlass,
  Star,
  BellSlash,
  Archive,
  Image as ImageIcon,
  Link as LinkIcon,
  FileText,
  ShieldCheck,
  CaretLeft,
} from '@phosphor-icons/react';
import UserPresenceAvatar from '@/components/UserPresenceAvatar';
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ChatMessageBubble from '@/components/chat/ChatMessageBubble';
import ChatStartPanel from '@/components/chat/ChatStartPanel';
import MessageComposer from '@/components/messages/MessageComposer';
import {
  getRoomName,
  getRoomSubtitle,
  formatLastSeen,
  type ChatRoom,
  type ChatMessage,
  type ChatUser,
} from '@/lib/chatHelpers';
import { formatChatDateLabel, formatSystemMessageContent } from '@/lib/chatMessageUtils';
import { normalizePresenceStatus, PRESENCE_LABELS } from '@/lib/presence';

function isSameDay(d1: string, d2: string) {
  return new Date(d1).toDateString() === new Date(d2).toDateString();
}

function getRoomAvatar(room: ChatRoom, userId: string) {
  if (room.type === 'DM') return room.participants.find((p) => p.userId !== userId)?.user;
  return undefined;
}

type SidePanel = 'none' | 'info' | 'media' | 'starred' | 'search';

type GlobalSearchResults = {
  rooms: ChatRoom[];
  messages: { id: string; roomId: string; roomName?: string; content: string; senderName: string }[];
};

type MediaItem = {
  id: string;
  fileName?: string;
  mimeType?: string;
  createdAt: string;
  senderName: string;
};

export type MessageThreadPanelProps = {
  activeRoom: ChatRoom | null;
  userId: string;
  userRole?: string;
  isClient: boolean;
  rooms: ChatRoom[];
  contacts: ChatUser[];
  contactsLoading: boolean;
  messages: ChatMessage[];
  loadingMessages: boolean;
  msgInput: string;
  onMsgInputChange: (value: string) => void;
  replyTo: ChatMessage | null;
  onReplyToChange: (msg: ChatMessage | null) => void;
  inChatSearch: string;
  onInChatSearchChange: (value: string) => void;
  globalSearch: string;
  onGlobalSearchChange: (value: string) => void;
  globalResults: GlobalSearchResults | null;
  sidePanel: SidePanel;
  onSidePanelChange: (panel: SidePanel) => void;
  starredList: { roomId: string; message: ChatMessage }[];
  mediaItems: MediaItem[];
  typingLabel: string | null;
  mentionUsers: ChatUser[];
  uploadingFile: boolean;
  fileError: string | null;
  onBack: () => void;
  onOpenNewChat: () => void;
  onSelectRoom: (room: ChatRoom) => void;
  onStartDirect: (user: ChatUser) => void;
  onFetchMessages: (roomId: string, q?: string) => void;
  onRunGlobalSearch: () => void;
  onLoadStarred: () => void;
  onLoadMedia: (tab: string) => void;
  onSendMessage: () => void;
  onSendFile: (file: File) => void;
  onEmitTyping: (typing: boolean) => void;
  onDeleteMessage: (msg: ChatMessage) => void;
  onForward: (msg: ChatMessage) => void;
  onPreviewFile: (msg: ChatMessage) => void;
  onTogglePin: (msgId: string, isPinned: boolean) => void;
  onReact: (msgId: string, emoji: 'thumbsup' | 'check' | 'question') => void;
  onToggleStar: (msgId: string, isStarred: boolean) => void;
  onUpdateRoomSettings: (patch: { isMuted?: boolean; isPinned?: boolean; isArchived?: boolean }) => void;
};

export default function MessageThreadPanel({
  activeRoom,
  userId,
  userRole,
  isClient,
  rooms,
  contacts,
  contactsLoading,
  messages,
  loadingMessages,
  msgInput,
  onMsgInputChange,
  replyTo,
  onReplyToChange,
  inChatSearch,
  onInChatSearchChange,
  globalSearch,
  onGlobalSearchChange,
  globalResults,
  sidePanel,
  onSidePanelChange,
  starredList,
  mediaItems,
  typingLabel,
  mentionUsers,
  uploadingFile,
  fileError,
  onBack,
  onOpenNewChat,
  onSelectRoom,
  onStartDirect,
  onFetchMessages,
  onRunGlobalSearch,
  onLoadStarred,
  onLoadMedia,
  onSendMessage,
  onSendFile,
  onEmitTyping,
  onDeleteMessage,
  onForward,
  onPreviewFile,
  onTogglePin,
  onReact,
  onToggleStar,
  onUpdateRoomSettings,
}: MessageThreadPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  const pinnedMessages = messages.filter((m) => m.isPinned);
  const roomAvatar = activeRoom ? getRoomAvatar(activeRoom, userId) : undefined;
  const roomDisplayName = activeRoom ? getRoomName(activeRoom, userId) : '';

  const placeholder =
    activeRoom?.type === 'CHANNEL'
      ? 'Write a message (@ to mention)'
      : 'Write a message (@ to mention someone)';

  const scrollToFirstPinned = useCallback(() => {
    const pinned = messages.find((m) => m.isPinned);
    if (!pinned) return;
    document.getElementById(`chat-msg-${pinned.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectRoomFromSearch = (roomId: string, query: string) => {
    onSelectRoom(rooms.find((r) => r.id === roomId) || ({ id: roomId } as ChatRoom));
    onInChatSearchChange(query);
    onFetchMessages(roomId, query);
  };

  return (
    <>
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col bg-background ${!activeRoom ? 'hidden md:flex' : 'flex'}`}
      >
        {!activeRoom ? (
          <ChatStartPanel
            isClient={isClient}
            userId={userId}
            rooms={rooms}
            contacts={contacts}
            contactsLoading={contactsLoading}
            onOpenNewChat={onOpenNewChat}
            onSelectRoom={onSelectRoom}
            onStartDirect={onStartDirect}
          />
        ) : (
          <>
            <div className="px-3 py-1.5 border-b border-border bg-muted flex items-center gap-2 text-[10px] text-foreground-muted shrink-0">
              <ShieldCheck size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              Records retained for audit trail
            </div>
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  className="rounded-lg p-2 text-foreground-muted hover:bg-hover-bg hover:text-foreground md:hidden"
                  aria-label="Back to conversations"
                  onClick={onBack}
                >
                  <CaretLeft size={20} />
                </button>
                {activeRoom.type === 'DM' && roomAvatar ? (
                  <UserPresenceAvatar
                    userId={roomAvatar.id}
                    initials={roomAvatar.initials}
                    presenceStatus={normalizePresenceStatus(roomAvatar.presenceStatus)}
                    size="sm"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
                    <Hash size={16} />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">{roomDisplayName}</h3>
                  <div className="text-xs text-foreground-muted truncate">
                    {typingLabel ||
                      (activeRoom.type === 'DM' && roomAvatar ? (
                        <Status
                          status={normalizePresenceStatus(roomAvatar.presenceStatus)}
                          className="inline-flex border-0 bg-transparent px-0 py-0 shadow-none"
                        >
                          <StatusIndicator />
                          <StatusLabel className="text-xs">
                            {normalizePresenceStatus(roomAvatar.presenceStatus) === 'offline'
                              ? formatLastSeen(roomAvatar.lastSeenAt) || PRESENCE_LABELS.offline
                              : PRESENCE_LABELS[normalizePresenceStatus(roomAvatar.presenceStatus)]}
                          </StatusLabel>
                        </Status>
                      ) : (
                        getRoomSubtitle(activeRoom, userId)
                      ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title="Search in chat"
                  aria-label="Search in chat"
                  onClick={() => onSidePanelChange(sidePanel === 'search' ? 'none' : 'search')}
                  className="p-2 rounded-lg hover:bg-hover-bg text-foreground-muted"
                >
                  <MagnifyingGlass size={16} />
                </button>
                <button
                  type="button"
                  title="Starred messages"
                  aria-label="Starred messages"
                  onClick={() => {
                    onSidePanelChange('starred');
                    onLoadStarred();
                  }}
                  className="p-2 rounded-lg hover:bg-hover-bg text-foreground-muted"
                >
                  <Star size={16} />
                </button>
                <button
                  type="button"
                  title="Media"
                  aria-label="Media"
                  onClick={() => {
                    onSidePanelChange('media');
                    onLoadMedia('photos');
                  }}
                  className="p-2 rounded-lg hover:bg-hover-bg text-foreground-muted"
                >
                  <ImageIcon size={16} />
                </button>
                {pinnedMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={scrollToFirstPinned}
                    className="p-2 rounded-lg hover:bg-hover-bg text-foreground-muted"
                    title="Jump to pinned messages"
                    aria-label="Jump to pinned messages"
                  >
                    <PushPinSimple size={16} weight="fill" />
                  </button>
                )}
                <button
                  type="button"
                  title={activeRoom.isPinned ? 'Unpin conversation' : 'Pin conversation'}
                  aria-label={activeRoom.isPinned ? 'Unpin conversation' : 'Pin conversation'}
                  onClick={() => onUpdateRoomSettings({ isPinned: !activeRoom.isPinned })}
                  className="p-2 rounded-lg hover:bg-hover-bg text-foreground-muted"
                >
                  <Pin size={16} weight={activeRoom.isPinned ? 'fill' : 'regular'} />
                </button>
                <button
                  type="button"
                  title={activeRoom.isMuted ? 'Unmute' : 'Mute'}
                  aria-label={activeRoom.isMuted ? 'Unmute' : 'Mute'}
                  onClick={() => onUpdateRoomSettings({ isMuted: !activeRoom.isMuted })}
                  className="p-2 rounded-lg hover:bg-hover-bg text-foreground-muted"
                >
                  <BellSlash size={16} />
                </button>
                <button
                  type="button"
                  title="Archive chat"
                  aria-label="Archive chat"
                  onClick={() => onUpdateRoomSettings({ isArchived: true })}
                  className="p-2 rounded-lg hover:bg-hover-bg text-foreground-muted"
                >
                  <Archive size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Chat info"
                  onClick={() => onSidePanelChange(sidePanel === 'info' ? 'none' : 'info')}
                  className={`p-2 rounded-lg hover:bg-hover-bg transition-colors ${
                    sidePanel === 'info' ? 'text-foreground bg-surface-muted' : 'text-foreground-muted'
                  }`}
                >
                  <Users size={16} />
                </button>
              </div>
            </div>

            {sidePanel === 'search' && (
              <div className="px-4 py-2 border-b border-border bg-card space-y-2">
                <input
                  value={inChatSearch}
                  onChange={(e) => onInChatSearchChange(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && activeRoom && onFetchMessages(activeRoom.id, inChatSearch)
                  }
                  placeholder="Search in this chat (UDIN, GSTR, filename…)"
                  aria-label="Search in this chat"
                  className="input-field w-full text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs btn-primary px-3 py-1 rounded-lg"
                    onClick={() => activeRoom && onFetchMessages(activeRoom.id, inChatSearch)}
                  >
                    Search
                  </button>
                  <input
                    value={globalSearch}
                    onChange={(e) => onGlobalSearchChange(e.target.value)}
                    placeholder="Search all chats"
                    aria-label="Search all chats"
                    className="input-field flex-1 text-xs"
                  />
                  <button
                    type="button"
                    className="text-xs px-3 py-1 rounded-lg border border-border"
                    onClick={onRunGlobalSearch}
                  >
                    All
                  </button>
                </div>
                {globalResults && (
                  <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                    {globalResults.messages.map((m) => (
                      <button
                        key={`${m.roomId}-${m.id}`}
                        type="button"
                        className="block w-full text-left hover:bg-hover-bg p-1 rounded"
                        onClick={() => selectRoomFromSearch(m.roomId, globalSearch)}
                      >
                        <span className="font-medium">{m.roomName || 'Chat'}:</span> {m.content.slice(0, 80)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {loadingMessages && messages.length === 0 ? (
                <div className="flex justify-center py-10">
                  <div className="w-5 h-5 border-2 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-foreground-muted">
                  <p className="text-sm text-center max-w-xs">
                    No messages in this conversation. Send a message to begin.
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.senderId === userId;
                  const showDate = i === 0 || !isSameDay(messages[i - 1].createdAt, msg.createdAt);
                  const showSender =
                    !isMe && (i === 0 || messages[i - 1].senderId !== msg.senderId || showDate);
                  const isSystem = msg.type === 'SYSTEM';

                  return (
                    <div key={msg.id} id={`chat-msg-${msg.id}`}>
                      {showDate && (
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[11px] text-foreground-muted font-medium">
                            {formatChatDateLabel(msg.createdAt)}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}

                      {isSystem ? (
                        <div className="flex justify-center my-3 px-2">
                          <span className="text-xs text-foreground-secondary bg-muted/80 border border-border px-3 py-1.5 rounded-full text-center max-w-[90%]">
                            {formatSystemMessageContent(msg.content || '')}
                          </span>
                        </div>
                      ) : (
                        <ChatMessageBubble
                          msg={msg}
                          roomId={activeRoom.id}
                          isMe={isMe}
                          showSender={showSender}
                          searchHighlight={inChatSearch}
                          canDelete={isMe || userRole === 'Partner' || userRole === 'Admin'}
                          onPreviewFile={onPreviewFile}
                          onForward={onForward}
                          onDelete={onDeleteMessage}
                          onTogglePin={onTogglePin}
                          onReply={onReplyToChange}
                          onReact={onReact}
                          onToggleStar={onToggleStar}
                        />
                      )}
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <MessageComposer
              msgInput={msgInput}
              onMsgInputChange={onMsgInputChange}
              replyTo={replyTo}
              onClearReply={() => onReplyToChange(null)}
              onSubmit={onSendMessage}
              onSendFile={onSendFile}
              onTyping={onEmitTyping}
              uploadingFile={uploadingFile}
              fileError={fileError}
              placeholder={placeholder}
              mentionUsers={mentionUsers}
              includeRoleMentions={activeRoom.type === 'CHANNEL'}
            />
          </>
        )}
      </div>

      {sidePanel === 'info' && activeRoom && (
        <div className="w-72 border-l border-border flex flex-col bg-card shrink-0 hidden md:flex">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Details</h4>
            <button
              type="button"
              onClick={() => onSidePanelChange('none')}
              className="p-1 rounded hover:bg-hover-bg text-foreground-muted"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {activeRoom.participants.map((p) => (
              <div key={p.userId} className="flex items-center gap-2.5">
                <UserPresenceAvatar
                  userId={p.user.id}
                  initials={p.user.initials}
                  presenceStatus={normalizePresenceStatus(p.user.presenceStatus)}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {p.user.name} {p.userId === userId ? '(you)' : ''}
                  </p>
                  <p className="text-[10px] text-foreground-muted">
                    {normalizePresenceStatus(p.user.presenceStatus) === 'offline'
                      ? formatLastSeen(p.user.lastSeenAt) || PRESENCE_LABELS.offline
                      : PRESENCE_LABELS[normalizePresenceStatus(p.user.presenceStatus)]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sidePanel === 'starred' && (
        <div className="w-72 border-l border-border flex flex-col bg-card shrink-0 hidden md:flex">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h4 className="text-sm font-semibold">Starred messages</h4>
            <button type="button" onClick={() => onSidePanelChange('none')} className="p-1">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
            {starredList.map((s) => (
              <button
                key={s.message.id}
                type="button"
                className="w-full text-left p-2 rounded-lg hover:bg-hover-bg"
                onClick={() => {
                  const room = rooms.find((r) => r.id === s.roomId);
                  if (room) onSelectRoom(room);
                }}
              >
                <p className="font-medium truncate">{s.message.content?.slice(0, 60)}</p>
                <p className="text-foreground-muted">{s.message.sender?.name}</p>
              </button>
            ))}
            {starredList.length === 0 && (
              <p className="text-foreground-muted text-center py-4">No starred messages</p>
            )}
          </div>
        </div>
      )}

      {sidePanel === 'media' && activeRoom && (
        <div className="w-72 border-l border-border flex flex-col bg-card shrink-0 hidden md:flex">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h4 className="text-sm font-semibold">Shared media</h4>
            <button type="button" onClick={() => onSidePanelChange('none')} className="p-1">
              <X size={14} />
            </button>
          </div>
          <Tabs
            defaultValue="photos"
            className="flex-1 flex flex-col min-h-0"
            onValueChange={(v) => onLoadMedia(v)}
          >
            <TabsList className="mx-2 mt-2">
              <TabsTrigger value="photos">
                <ImageIcon size={14} className="mr-1" /> Photos
              </TabsTrigger>
              <TabsTrigger value="docs">
                <FileText size={14} className="mr-1" /> Docs
              </TabsTrigger>
              <TabsTrigger value="links">
                <LinkIcon size={14} className="mr-1" /> Links
              </TabsTrigger>
            </TabsList>
            {(['photos', 'docs', 'links'] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="flex-1 overflow-y-auto p-2 text-xs space-y-1">
                {mediaItems.map((item) => (
                  <p key={item.id + (item.fileName || '')} className="truncate p-1 hover:bg-hover-bg rounded">
                    {item.fileName}
                  </p>
                ))}
                {mediaItems.length === 0 && (
                  <p className="text-foreground-muted text-center py-4">Nothing here yet</p>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </>
  );
}
