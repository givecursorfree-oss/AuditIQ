import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useGlobalChat } from '@/context/GlobalChatContext';
import { type ChatRoom, type ChatMessage, type ChatUser } from '@/lib/chatHelpers';
import { mapApiMessage } from '@/lib/chatMessageUtils';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { normalizePresenceStatus } from '@/lib/presence';
import ChatFilePreviewDialog from '@/components/chat/ChatFilePreviewDialog';
import ChatForwardDialog from '@/components/chat/ChatForwardDialog';
import ChatNewConversationDialog from '@/components/chat/ChatNewConversationDialog';
import ConversationListPanel from '@/components/messages/ConversationListPanel';
import MessageThreadPanel from '@/components/messages/MessageThreadPanel';
import { useMessagesSocket } from '@/components/messages/useMessagesSocket';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import PageHeader from '@/components/layout/PageHeader';

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
    roomSearch,
    setRoomSearch,
    selectRoom,
  } = useGlobalChat();
  const [searchParams, setSearchParams] = useSearchParams();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [sidePanel, setSidePanel] = useState<'none' | 'info' | 'media' | 'starred' | 'search'>('none');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<ChatMessage | null>(null);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const [inChatSearch, setInChatSearch] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalResults, setGlobalResults] = useState<{
    rooms: ChatRoom[];
    messages: { id: string; roomId: string; roomName?: string; content: string; senderName: string }[];
  } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [starredList, setStarredList] = useState<{ roomId: string; message: ChatMessage }[]>([]);
  const [mediaItems, setMediaItems] = useState<
    { id: string; fileName?: string; mimeType?: string; createdAt: string; senderName: string }[]
  >([]);

  // ponytail: ignore stale fetches when room/search changes mid-flight
  const messagesLoadSeq = useRef(0);
  const roomsRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRoomsRefresh = useCallback(() => {
    if (roomsRefreshTimer.current) clearTimeout(roomsRefreshTimer.current);
    roomsRefreshTimer.current = setTimeout(() => {
      void refreshRooms({ includeArchived: showArchived });
    }, 600);
  }, [refreshRooms, showArchived]);

  useEffect(
    () => () => {
      if (roomsRefreshTimer.current) clearTimeout(roomsRefreshTimer.current);
    },
    []
  );

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const fetchMessages = useCallback(
    async (roomId: string, q?: string) => {
      const seq = ++messagesLoadSeq.current;
      setLoadingMessages(true);
      try {
        const { data } = await api.get(`/chat/rooms/${roomId}/messages`, {
          params: { limit: 100, ...(q?.trim() ? { q: q.trim() } : {}) },
        });
        if (seq !== messagesLoadSeq.current) return;
        const raw = Array.isArray(data) ? data : data.messages ?? [];
        setMessages(raw.map((m: Record<string, unknown>) => mapApiMessage(m)));
        scheduleRoomsRefresh();
      } catch {
        /* empty */
      } finally {
        if (seq === messagesLoadSeq.current) setLoadingMessages(false);
      }
    },
    [scheduleRoomsRefresh]
  );

  const fetchUsers = useCallback(async () => {
    if (isClient) return;
    setLoadingUsers(true);
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
          role?: string;
        }>
      >('/chat/users');
      setAllUsers(
        data.map((u) => ({
          id: u.id,
          name: u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
          email: u.email,
          initials: u.initials || (u.name || u.email).slice(0, 2).toUpperCase(),
          presenceStatus: normalizePresenceStatus(u.presenceStatus),
          role: u.role,
        }))
      );
    } catch {
      /* empty */
    } finally {
      setLoadingUsers(false);
    }
  }, [isClient]);

  const { connected, typingUsers, emitTyping } = useMessagesSocket({
    activeRoomId,
    activeRoomIdForFetch: activeRoom?.id,
    showArchived,
    inChatSearch,
    appendMessage,
    refreshRooms,
    fetchMessages,
  });

  useEffect(() => {
    refreshRooms({ includeArchived: showArchived });
  }, [showArchived, refreshRooms]);

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && rooms.some((r) => r.id === roomParam)) {
      setActiveRoomId(roomParam);
    }
  }, [searchParams, rooms, setActiveRoomId]);

  const openNewChat = useCallback(() => {
    if (!isClient) {
      void fetchUsers();
      setShowNewChat(true);
    }
  }, [isClient, fetchUsers]);

  useEffect(() => {
    if (chatEnabled && !isClient) void fetchUsers();
  }, [chatEnabled, isClient, fetchUsers]);

  useEffect(() => {
    if (chatEnabled && !isClient && activeRoomId) void fetchUsers();
  }, [activeRoomId, chatEnabled, isClient, fetchUsers]);

  useEffect(() => {
    const onNewChat = () => openNewChat();
    window.addEventListener('auditiq:open-new-chat', onNewChat);
    return () => window.removeEventListener('auditiq:open-new-chat', onNewChat);
  }, [openNewChat]);

  useEffect(() => {
    if (searchParams.get('compose') === '1') {
      void fetchUsers();
      setShowNewChat(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, fetchUsers]);

  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      return;
    }
    void fetchMessages(activeRoomId, inChatSearch);
  }, [activeRoomId, inChatSearch, fetchMessages]);

  useEffect(() => {
    if (connected || !activeRoomId) return;
    const interval = setInterval(() => {
      void fetchMessages(activeRoomId, inChatSearch);
    }, 8000);
    return () => clearInterval(interval);
  }, [activeRoomId, connected, fetchMessages, inChatSearch]);

  async function markRead(roomId: string) {
    try {
      await api.post(`/chat/rooms/${roomId}/read`);
      scheduleRoomsRefresh();
    } catch {
      /* empty */
    }
  }

  async function sendMessage() {
    if (!msgInput.trim() || !activeRoom) return;
    const content = msgInput;
    setMsgInput('');
    emitTyping(false);
    try {
      const { data } = await api.post(`/chat/rooms/${activeRoom.id}/messages`, {
        content,
        parentId: replyTo?.id,
      });
      const mapped = mapApiMessage(data as Record<string, unknown>);
      appendMessage(mapped);
      setReplyTo(null);
      await refreshRooms({ includeArchived: showArchived });
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
      const { data } = await api.post(`/chat/rooms/${activeRoom.id}/messages/file`, fd, {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 0,
      });
      appendMessage(mapApiMessage(data as Record<string, unknown>));
      await refreshRooms({ includeArchived: showArchived });
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
    const ok = await appConfirm({
      title: 'Delete message?',
      message: 'Delete this message for everyone in this chat?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/chat/rooms/${activeRoom.id}/messages/${msg.id}`);
      await fetchMessages(activeRoom.id, inChatSearch);
      await refreshRooms({ includeArchived: showArchived });
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
    await refreshRooms({ includeArchived: showArchived });
    if (targetRoomId === activeRoom.id) {
      await fetchMessages(activeRoom.id, inChatSearch);
    }
  }

  async function togglePin(msgId: string, isPinned: boolean) {
    if (!activeRoom) return;
    if (isPinned) {
      await api.delete(`/chat/rooms/${activeRoom.id}/messages/${msgId}/pin`);
    } else {
      await api.post(`/chat/rooms/${activeRoom.id}/messages/${msgId}/pin`);
    }
    await fetchMessages(activeRoom.id, inChatSearch);
  }

  async function toggleStar(msgId: string, isStarred: boolean) {
    if (!activeRoom) return;
    if (isStarred) {
      await api.delete(`/chat/rooms/${activeRoom.id}/messages/${msgId}/star`);
    } else {
      await api.post(`/chat/rooms/${activeRoom.id}/messages/${msgId}/star`);
    }
    await fetchMessages(activeRoom.id, inChatSearch);
    if (sidePanel === 'starred') loadStarred();
  }

  async function reactToMessage(msgId: string, emoji: 'thumbsup' | 'check' | 'question') {
    if (!activeRoom) return;
    const existing = messages.find((m) => m.id === msgId)?.reactions?.find((r) => r.userId === user?.id);
    if (existing?.emoji === emoji) {
      await api.delete(`/chat/rooms/${activeRoom.id}/messages/${msgId}/reactions`);
    } else {
      await api.post(`/chat/rooms/${activeRoom.id}/messages/${msgId}/reactions`, { emoji });
    }
    await fetchMessages(activeRoom.id, inChatSearch);
  }

  async function updateRoomSettings(patch: { isMuted?: boolean; isPinned?: boolean; isArchived?: boolean }) {
    if (!activeRoom) return;
    await api.patch(`/chat/rooms/${activeRoom.id}/settings`, patch);
    await refreshRooms({ includeArchived: showArchived });
  }

  async function runGlobalSearch() {
    const q = globalSearch.trim();
    if (q.length < 2) {
      setGlobalResults(null);
      return;
    }
    const { data } = await api.get('/chat/search', { params: { q } });
    setGlobalResults(data);
  }

  async function loadStarred() {
    const { data } = await api.get('/chat/starred');
    setStarredList(
      (data as { roomId: string; message: Record<string, unknown> }[]).map((s) => ({
        roomId: s.roomId,
        message: mapApiMessage(s.message),
      }))
    );
  }

  async function loadMedia(tab: string) {
    if (!activeRoom) return;
    const { data } = await api.get(`/chat/rooms/${activeRoom.id}/media`, { params: { tab } });
    setMediaItems((data as { items: typeof mediaItems }).items || []);
  }

  async function startDM(otherUser: ChatUser) {
    try {
      const { data } = await api.post('/chat/rooms', {
        type: 'direct',
        participantIds: [otherUser.id],
      });
      await refreshRooms({ includeArchived: showArchived });
      setActiveRoomId((data as ChatRoom).id);
      setShowNewChat(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not start conversation. Please try again.';
      await appAlert(msg);
    }
  }

  async function startGroup(members: ChatUser[], name: string) {
    if (members.length < 2) return;
    try {
      const { data } = await api.post('/chat/rooms', {
        type: 'group',
        name,
        participantIds: members.map((m) => m.id),
      });
      await refreshRooms({ includeArchived: showArchived });
      setActiveRoomId((data as ChatRoom).id);
      setShowNewChat(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not create group. Please try again.';
      await appAlert(msg);
    }
  }

  const mentionUsers = useMemo(() => {
    if (!activeRoom) return [];
    const fromRoom = activeRoom.participants.map((p) => p.user);
    const byId = new Map<string, ChatUser>();
    for (const u of fromRoom) byId.set(u.id, u);
    for (const u of allUsers) {
      if (!byId.has(u.id)) byId.set(u.id, u);
    }
    return [...byId.values()].filter((u) => u.id !== user?.id);
  }, [activeRoom, allUsers, user?.id]);

  if (!chatEnabled) {
    return (
      <AppPageContainer>
        <PageHeader title="Messages" />
        <div className="flex items-center justify-center h-64 text-foreground-muted text-sm">
          Messaging is not available for your role.
        </div>
      </AppPageContainer>
    );
  }

  const typingLabel =
    typingUsers.length === 1
      ? `${typingUsers[0].name} is typing…`
      : typingUsers.length > 1
        ? `${typingUsers.length} people are typing…`
        : null;

  return (
    <AppPageContainer className="flex h-full min-h-0 flex-col space-y-3 sm:space-y-4">
      <PageHeader title="Messages" className="shrink-0" />
      <div className="flex flex-1 min-h-0 overflow-hidden relative rounded-xl border border-border bg-background">
        <ConversationListPanel
          rooms={rooms}
          activeRoomId={activeRoomId}
          userId={user?.id || ''}
          search={roomSearch}
          onSearchChange={setRoomSearch}
          onSelectRoom={selectRoom}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((v) => !v)}
          onNewChat={openNewChat}
          isClient={isClient}
          hideOnMobileWhenActive={!!activeRoom}
        />

        <MessageThreadPanel
          activeRoom={activeRoom}
          userId={user?.id || ''}
          userRole={user?.role}
          isClient={isClient}
          rooms={rooms}
          contacts={allUsers}
          contactsLoading={loadingUsers}
          messages={messages}
          loadingMessages={loadingMessages}
          msgInput={msgInput}
          onMsgInputChange={setMsgInput}
          replyTo={replyTo}
          onReplyToChange={setReplyTo}
          inChatSearch={inChatSearch}
          onInChatSearchChange={setInChatSearch}
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
          globalResults={globalResults}
          sidePanel={sidePanel}
          onSidePanelChange={setSidePanel}
          starredList={starredList}
          mediaItems={mediaItems}
          typingLabel={typingLabel}
          mentionUsers={mentionUsers}
          uploadingFile={uploadingFile}
          fileError={fileError}
          onBack={() => setActiveRoomId(null)}
          onOpenNewChat={openNewChat}
          onSelectRoom={selectRoom}
          onStartDirect={startDM}
          onFetchMessages={fetchMessages}
          onRunGlobalSearch={runGlobalSearch}
          onLoadStarred={loadStarred}
          onLoadMedia={loadMedia}
          onSendMessage={() => void sendMessage()}
          onSendFile={(file) => void sendFile(file)}
          onEmitTyping={emitTyping}
          onDeleteMessage={(msg) => void deleteMessage(msg)}
          onForward={setForwardMessage}
          onPreviewFile={setPreviewFile}
          onTogglePin={togglePin}
          onReact={reactToMessage}
          onToggleStar={toggleStar}
          onUpdateRoomSettings={updateRoomSettings}
        />

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

        {!isClient && (
          <ChatNewConversationDialog
            open={showNewChat}
            onOpenChange={setShowNewChat}
            users={allUsers}
            currentUserId={user?.id || ''}
            loading={loadingUsers}
            onStartDirect={startDM}
            onCreateGroup={startGroup}
          />
        )}
      </div>
    </AppPageContainer>
  );
}
