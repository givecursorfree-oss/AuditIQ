import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from './AuthContext';
import {
  CHAT_ROLES,
  type ChatRoom,
  getRoomName,
  getRoomSubtitle,
  messagePreview,
} from '../lib/chatHelpers';
import type { TeamsToastPayload } from '../components/ui/teams-message-toast';

type RoomFilter = 'all' | 'engagement' | 'direct';

type GlobalChatContextValue = {
  rooms: ChatRoom[];
  loading: boolean;
  activeRoomId: string | null;
  activeRoom: ChatRoom | null;
  setActiveRoomId: (id: string | null) => void;
  roomSearch: string;
  setRoomSearch: (q: string) => void;
  roomFilter: RoomFilter;
  setRoomFilter: (f: RoomFilter) => void;
  refreshRooms: (opts?: { includeArchived?: boolean }) => Promise<void>;
  openMessagesPage: () => void;
  selectRoom: (room: ChatRoom) => void;
  toasts: TeamsToastPayload[];
  dismissToast: (id: string) => void;
  openFromToast: (toastId: string) => void;
  isClient: boolean;
  chatEnabled: boolean;
};

const GlobalChatContext = createContext<GlobalChatContextValue | null>(null);

const POLL_MS = 3000;
const TOAST_TTL_MS = 8000;

function formatToastTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function GlobalChatProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const chatEnabled = !!user && CHAT_ROLES.includes(user.role as (typeof CHAT_ROLES)[number]);
  const isClient = user?.role === 'Client';

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomSearch, setRoomSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState<RoomFilter>(isClient ? 'engagement' : 'all');
  const [toasts, setToasts] = useState<TeamsToastPayload[]>([]);

  const lastMsgByRoom = useRef<Map<string, string>>(new Map());
  const initialized = useRef(false);

  const messagesPath = isClient ? '/client/messages' : '/messages';
  const onMessagesPage = location.pathname === messagesPath;

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  const pushToast = useCallback((room: ChatRoom, userId: string) => {
    const last = room.lastMessage;
    if (!last) return;

    const lastKey =
      last.id ||
      `${last.createdAt}-${last.senderId || ''}-${(last.content || '').slice(0, 32)}`;
    const toastId = `${room.id}::${lastKey}`;
    setToasts((prev) => {
      if (prev.some((t) => t.id === toastId)) return prev;
      const sender = last.sender;
      const next: TeamsToastPayload = {
        id: toastId,
        roomId: room.id,
        senderName: sender?.name || getRoomName(room, userId),
        senderInitials: sender?.initials || (sender?.name || '?').slice(0, 2).toUpperCase(),
        roomName: getRoomName(room, userId),
        preview: messagePreview(room, userId),
        timeLabel: formatToastTime(last.createdAt),
      };
      return [next, ...prev].slice(0, 4);
    });

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, TOAST_TTL_MS);
  }, []);

  const detectNewMessages = useCallback(
    (nextRooms: ChatRoom[], userId: string) => {
      for (const room of nextRooms) {
        const last = room.lastMessage;
        if (!last) continue;
        const lastId =
          last.id ||
          `${last.createdAt}-${last.senderId || ''}-${(last.content || '').slice(0, 32)}`;

        const prevId = lastMsgByRoom.current.get(room.id);
        if (initialized.current && prevId && prevId !== lastId) {
          const fromSelf = last.senderId === userId;
          const viewingThisRoom = onMessagesPage && activeRoomId === room.id && document.hasFocus();
          if (!fromSelf && !viewingThisRoom) {
            pushToast(room, userId);
          }
        }
        lastMsgByRoom.current.set(room.id, lastId);
      }
      initialized.current = true;
    },
    [activeRoomId, onMessagesPage, pushToast]
  );

  const detectNewMessagesRef = useRef(detectNewMessages);
  detectNewMessagesRef.current = detectNewMessages;

  const refreshRooms = useCallback(async (opts?: { includeArchived?: boolean }) => {
    if (authLoading || !chatEnabled || !user?.id) return;
    try {
      const { data } = await api.get<ChatRoom[]>('/chat/rooms', {
        params: opts?.includeArchived ? { includeArchived: '1' } : undefined,
      });
      const list = Array.isArray(data) ? data : [];
      detectNewMessagesRef.current(list, user.id);
      setRooms(list);
    } catch {
      /* polling may fail quietly */
    } finally {
      setLoading(false);
    }
  }, [authLoading, chatEnabled, user?.id]);

  useEffect(() => {
    if (authLoading || !chatEnabled) {
      if (!authLoading) setLoading(false);
      return;
    }
    refreshRooms();
    const interval = window.setInterval(refreshRooms, POLL_MS);
    return () => window.clearInterval(interval);
  }, [authLoading, chatEnabled, refreshRooms]);

  useEffect(() => {
    if (!chatEnabled || loading || activeRoomId) return;
    if (isClient) {
      const first = rooms.find((r) => r.engagementId);
      if (first) setActiveRoomId(first.id);
    }
  }, [chatEnabled, loading, rooms, isClient, activeRoomId]);

  const openMessagesPage = useCallback(() => {
    navigate(messagesPath);
  }, [navigate, messagesPath]);

  const selectRoom = useCallback(
    (room: ChatRoom) => {
      setActiveRoomId(room.id);
      if (!onMessagesPage) {
        navigate(messagesPath);
      }
    },
    [navigate, messagesPath, onMessagesPage]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openFromToast = useCallback(
    (toastId: string) => {
      const toast = toasts.find((t) => t.id === toastId);
      const room = toast ? rooms.find((r) => r.id === toast.roomId) : undefined;
      if (room) selectRoom(room);
      dismissToast(toastId);
    },
    [rooms, selectRoom, dismissToast, toasts]
  );

  const value = useMemo(
    () => ({
      rooms,
      loading,
      activeRoomId,
      activeRoom,
      setActiveRoomId,
      roomSearch,
      setRoomSearch,
      roomFilter,
      setRoomFilter,
      refreshRooms,
      openMessagesPage,
      selectRoom,
      toasts,
      dismissToast,
      openFromToast,
      isClient,
      chatEnabled,
    }),
    [
      rooms,
      loading,
      activeRoomId,
      activeRoom,
      roomSearch,
      roomFilter,
      refreshRooms,
      openMessagesPage,
      selectRoom,
      toasts,
      dismissToast,
      openFromToast,
      isClient,
      chatEnabled,
    ]
  );

  return <GlobalChatContext.Provider value={value}>{children}</GlobalChatContext.Provider>;
}

export function useGlobalChat() {
  const ctx = useContext(GlobalChatContext);
  if (!ctx) {
    throw new Error('useGlobalChat must be used within GlobalChatProvider');
  }
  return ctx;
}

export function useGlobalChatOptional() {
  return useContext(GlobalChatContext);
}
