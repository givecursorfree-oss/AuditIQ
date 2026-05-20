import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PaperPlaneTilt as Send, Paperclip, PushPin as Pin, X,
  Users, Hash,
  ChatCircle as MessageSquare,
} from '@phosphor-icons/react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useGlobalChat } from '../context/GlobalChatContext';
import {
  getRoomName,
  getRoomSubtitle,
  type ChatRoom,
  type ChatMessage,
  type ChatUser,
} from '../lib/chatHelpers';
import { mapApiMessage } from '../lib/chatMessageUtils';
import UserPresenceAvatar from '../components/UserPresenceAvatar';
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status';
import { normalizePresenceStatus, PRESENCE_LABELS } from '@/lib/presence';
import ChatFilePreviewDialog from '../components/chat/ChatFilePreviewDialog';
import ChatForwardDialog from '../components/chat/ChatForwardDialog';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function isSameDay(d1: string, d2: string) {
  return new Date(d1).toDateString() === new Date(d2).toDateString();
}

function dateLabel(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getRoomAvatar(room: ChatRoom, userId: string) {
  if (room.type === 'DM') return room.participants.find((p) => p.userId !== userId)?.user;
  return undefined;
}

export default function Messages() {
  const { user } = useAuth();
  const {
    activeRoom,
    activeRoomId,
    setActiveRoomId,
    refreshRooms,
    rooms,
    isClient,
    chatEnabled,
  } = useGlobalChat();
  const [searchParams, setSearchParams] = useSearchParams();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<ChatMessage | null>(null);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onNewChat = () => {
      fetchUsers();
      setShowNewChat(true);
    };
    window.addEventListener('auditiq:open-new-chat', onNewChat);
    return () => window.removeEventListener('auditiq:open-new-chat', onNewChat);
  }, []);

  useEffect(() => {
    if (searchParams.get('compose') === '1') {
      fetchUsers();
      setShowNewChat(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!activeRoom) return;
    fetchMessages(activeRoom.id);
    markRead(activeRoom.id);
  }, [activeRoomId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!activeRoom) return;
    const interval = setInterval(() => {
      fetchMessages(activeRoom.id);
      refreshRooms();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeRoomId]);

  async function fetchMessages(roomId: string) {
    setLoadingMessages(true);
    try {
      const { data } = await api.get(`/chat/rooms/${roomId}/messages`, { params: { limit: 100 } });
      const raw = Array.isArray(data) ? data : data.messages ?? [];
      setMessages(raw.map((m: Record<string, unknown>) => mapApiMessage(m)));
    } catch {
      /* empty */
    } finally {
      setLoadingMessages(false);
    }
  }

  async function markRead(roomId: string) {
    try {
      await api.post(`/chat/rooms/${roomId}/read`);
      await refreshRooms();
    } catch {
      /* empty */
    }
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!msgInput.trim() || !activeRoom) return;
    const content = msgInput;
    setMsgInput('');
    try {
      await api.post(`/chat/rooms/${activeRoom.id}/messages`, { content });
      await fetchMessages(activeRoom.id);
      await refreshRooms();
    } catch {
      setMsgInput(content);
    }
  }

  async function sendFile(file: File) {
    if (!activeRoom) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploadingFile(true);
    setFileError(null);
    try {
      await api.post(`/chat/rooms/${activeRoom.id}/messages/file`, fd, {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 0,
      });
      await fetchMessages(activeRoom.id);
      await refreshRooms();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not upload file. Please try again.';
      setFileError(msg);
    } finally {
      setUploadingFile(false);
    }
  }

  async function deleteMessage(msg: ChatMessage) {
    if (!activeRoom || msg.isDeleted) return;
    const ok = window.confirm('Delete this message for everyone in this chat?');
    if (!ok) return;
    try {
      await api.delete(`/chat/rooms/${activeRoom.id}/messages/${msg.id}`);
      await fetchMessages(activeRoom.id);
      await refreshRooms();
    } catch {
      setFileError('Could not delete message.');
    }
  }

  async function forwardToRoom(targetRoomId: string) {
    if (!activeRoom || !forwardMessage) return;
    await api.post(
      `/chat/rooms/${activeRoom.id}/messages/${forwardMessage.id}/forward`,
      { targetRoomId }
    );
    await refreshRooms();
    if (targetRoomId === activeRoom.id) {
      await fetchMessages(activeRoom.id);
    }
  }

  async function togglePin(msgId: string, isPinned: boolean) {
    if (!activeRoom) return;
    if (isPinned) {
      await api.delete(`/chat/rooms/${activeRoom.id}/messages/${msgId}/pin`);
    } else {
      await api.post(`/chat/rooms/${activeRoom.id}/messages/${msgId}/pin`);
    }
    await fetchMessages(activeRoom.id);
  }

  async function startDM(otherUser: ChatUser) {
    try {
      const { data } = await api.post('/chat/rooms', {
        type: 'direct',
        participantIds: [otherUser.id],
      });
      await refreshRooms();
      setActiveRoomId((data as ChatRoom).id);
      setShowNewChat(false);
    } catch {
      alert('Could not start conversation. Please try again.');
    }
  }

  async function fetchUsers() {
    try {
      const { data } = await api.get<
        Array<{
          id: string;
          name?: string;
          firstName?: string;
          lastName?: string;
          email: string;
          initials?: string;
          presenceStatus?: string;
        }>
      >('/chat/users');
      setAllUsers(
        data.map((u) => ({
          id: u.id,
          name: u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
          email: u.email,
          initials: u.initials || (u.name || u.email).slice(0, 2).toUpperCase(),
          presenceStatus: normalizePresenceStatus(u.presenceStatus),
        }))
      );
    } catch {
      /* empty */
    }
  }

  if (!chatEnabled) {
    return (
      <div className="flex items-center justify-center h-64 text-foreground-muted text-sm">
        Messaging is not available for your role.
      </div>
    );
  }

  const pinnedMessages = messages.filter((m) => m.isPinned);
  const roomAvatar = activeRoom ? getRoomAvatar(activeRoom, user?.id || '') : undefined;
  const roomDisplayName = activeRoom ? getRoomName(activeRoom, user?.id || '') : '';

  return (
    <div className="h-full flex overflow-hidden relative">
      <div className="flex-1 flex flex-col min-w-0">
        {!activeRoom ? (
          <div className="flex-1 flex flex-col items-center justify-center text-foreground-muted">
            <MessageSquare size={56} className="mb-4 opacity-20" />
            <p className="text-lg font-medium mb-1">{isClient ? 'Message your team' : 'Welcome to Messages'}</p>
            <p className="text-sm text-center max-w-xs">
              Use the dynamic island at the bottom of any page to pick a conversation.
            </p>
          </div>
        ) : (
          <>
            <div className="h-16 border-b border-border flex items-center justify-between px-4 bg-surface/50 shrink-0">
              <div className="flex items-center gap-3">
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
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{roomDisplayName}</h3>
                  <p className="text-xs text-foreground-muted flex items-center gap-2">
                    {activeRoom.type === 'DM' && roomAvatar ? (
                      <Status
                        status={normalizePresenceStatus(roomAvatar.presenceStatus)}
                        className="inline-flex border-0 bg-transparent px-0 py-0 shadow-none"
                      >
                        <StatusIndicator />
                        <StatusLabel className="text-xs">
                          {PRESENCE_LABELS[normalizePresenceStatus(roomAvatar.presenceStatus)]}
                        </StatusLabel>
                      </Status>
                    ) : activeRoom.engagementId ? (
                      getRoomSubtitle(activeRoom, user?.id || '')
                    ) : (
                      `${activeRoom.participants.length} members`
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {pinnedMessages.length > 0 && (
                  <button className="p-2 rounded-lg hover:bg-hover-bg text-foreground-muted" title="Pinned messages">
                    <Pin size={16} />
                  </button>
                )}
                <button
                  onClick={() => setShowContextPanel(!showContextPanel)}
                  className={`p-2 rounded-lg hover:bg-hover-bg transition-colors ${
                    showContextPanel ? 'text-primary bg-primary/10' : 'text-foreground-muted'
                  }`}
                >
                  <Users size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {loadingMessages && messages.length === 0 ? (
                <div className="flex justify-center py-10">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-foreground-muted">
                  <p className="text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.senderId === user?.id;
                  const showDate = i === 0 || !isSameDay(messages[i - 1].createdAt, msg.createdAt);
                  const showSender =
                    !isMe && (i === 0 || messages[i - 1].senderId !== msg.senderId || showDate);
                  const isSystem = msg.type === 'SYSTEM';

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] text-foreground-secondary font-medium bg-card border border-border px-2 py-0.5 rounded-full">
                            {dateLabel(msg.createdAt)}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}

                      {isSystem ? (
                        <div className="flex justify-center my-2">
                          <span className="text-xs text-foreground-muted bg-hover-bg px-3 py-1 rounded-full">
                            {msg.content}
                          </span>
                        </div>
                      ) : (
                        <ChatMessageBubble
                          msg={msg}
                          isMe={isMe}
                          showSender={showSender}
                          canDelete={
                            isMe ||
                            user?.role === 'Partner' ||
                            user?.role === 'Admin'
                          }
                          onPreviewFile={setPreviewFile}
                          onForward={setForwardMessage}
                          onDelete={deleteMessage}
                          onTogglePin={togglePin}
                        />
                      )}
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-border p-3 bg-surface/50 shrink-0">
              {fileError && (
                <p className="text-xs text-danger mb-2 px-1">{fileError}</p>
              )}
              <form onSubmit={sendMessage} className="flex items-end gap-2">
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl hover:bg-hover-bg text-foreground-muted transition-colors shrink-0 disabled:opacity-50"
                  title="Attach file"
                >
                  <Paperclip size={18} className={uploadingFile ? 'animate-pulse' : ''} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) sendFile(f);
                    e.target.value = '';
                  }}
                />
                <textarea
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  rows={1}
                  className="input-field flex-1 text-sm resize-none min-h-[40px] max-h-[120px] bg-card border border-border text-foreground"
                />
                <button
                  type="submit"
                  disabled={!msgInput.trim()}
                  className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                    msgInput.trim() ? 'bg-primary text-white hover:bg-primary/90' : 'bg-hover-bg text-foreground-muted'
                  }`}
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {showContextPanel && activeRoom && (
        <div className="w-72 border-l border-border flex flex-col bg-surface/50 shrink-0">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Details</h4>
            <button onClick={() => setShowContextPanel(false)} className="p-1 rounded hover:bg-hover-bg text-foreground-muted">
              <X size={14} />
            </button>
          </div>
          <div className="p-4 border-b border-border text-center">
            <p className="font-semibold text-foreground">{roomDisplayName}</p>
            <p className="text-xs text-foreground-muted mt-0.5">{activeRoom.participants.length} members</p>
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
                    {p.user.name} {p.userId === user?.id ? '(you)' : ''}
                  </p>
                  <Status
                    status={normalizePresenceStatus(p.user.presenceStatus)}
                    className="inline-flex border-0 bg-transparent px-0 py-0 shadow-none mt-0.5"
                  >
                    <StatusIndicator />
                    <StatusLabel className="text-[10px]">
                      {PRESENCE_LABELS[normalizePresenceStatus(p.user.presenceStatus)]}
                    </StatusLabel>
                  </Status>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeRoom && (
        <>
          <ChatFilePreviewDialog
            open={!!previewFile}
            onOpenChange={(open) => !open && setPreviewFile(null)}
            roomId={activeRoom.id}
            message={previewFile}
          />
          <ChatForwardDialog
            open={!!forwardMessage}
            onOpenChange={(open) => !open && setForwardMessage(null)}
            message={forwardMessage}
            rooms={rooms}
            currentRoomId={activeRoom.id}
            userId={user?.id || ''}
            onForward={forwardToRoom}
          />
        </>
      )}

      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4" onClick={() => setShowNewChat(false)}>
          <div className="bg-card rounded-xl shadow-xl border border-border w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">New Conversation</h3>
              <button onClick={() => setShowNewChat(false)} className="p-1 rounded hover:bg-hover-bg text-foreground-muted">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {allUsers
                .filter((u) => u.id !== user?.id)
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startDM(u)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-hover-bg text-left"
                  >
                    <UserPresenceAvatar
                      userId={u.id}
                      initials={u.initials}
                      presenceStatus={normalizePresenceStatus(u.presenceStatus)}
                      size="sm"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-foreground-muted">
                        {PRESENCE_LABELS[normalizePresenceStatus(u.presenceStatus)]}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
