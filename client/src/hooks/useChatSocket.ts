import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import type { ChatMessage } from '../lib/chatHelpers';
import { mapApiMessage } from '../lib/chatMessageUtils';
import { resolveApiOrigin } from '@/lib/apiBase';

export type TypingUser = { userId: string; name: string };

type UseChatSocketOptions = {
  roomId: string | null;
  onMessage?: (msg: ChatMessage) => void;
  onRoomsUpdated?: () => void;
  onReaction?: (payload: { messageId: string; roomId: string }) => void;
};

export function useChatSocket({
  roomId,
  onMessage,
  onRoomsUpdated,
  onReaction,
}: UseChatSocketOptions) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomIdRef = useRef(roomId);
  const onMessageRef = useRef(onMessage);
  const onRoomsUpdatedRef = useRef(onRoomsUpdated);
  const onReactionRef = useRef(onReaction);

  roomIdRef.current = roomId;
  onMessageRef.current = onMessage;
  onRoomsUpdatedRef.current = onRoomsUpdated;
  onReactionRef.current = onReaction;

  const apiOrigin = resolveApiOrigin();

  useEffect(() => {
    const socket = io(apiOrigin, { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('chat-message', (payload: Record<string, unknown>) => {
      const msg = mapApiMessage(payload);
      onMessageRef.current?.(msg);
    });

    socket.on('chat-rooms-updated', () => {
      onRoomsUpdatedRef.current?.();
    });

    socket.on('chat-typing', (payload: { roomId?: string; typing?: TypingUser[] }) => {
      if (payload.roomId && payload.roomId === roomIdRef.current) {
        setTypingUsers(payload.typing || []);
      }
    });

    socket.on('chat-reaction', (payload: { messageId: string; roomId: string }) => {
      onReactionRef.current?.(payload);
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [apiOrigin]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;

    socket.emit('join-chat-room', { roomId }, (ack?: { ok?: boolean; typing?: TypingUser[] }) => {
      if (ack?.typing) setTypingUsers(ack.typing);
    });

    return () => {
      socket.emit('leave-chat-room', { roomId });
      setTypingUsers([]);
    };
  }, [roomId, connected]);

  const emitTyping = useCallback(
    (active: boolean) => {
      const socket = socketRef.current;
      if (!socket || !roomId || !user) return;
      const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      socket.emit('chat-typing', { roomId, active, displayName });
      if (active) {
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => {
          socket.emit('chat-typing', { roomId, active: false, displayName });
        }, 3000);
      }
    },
    [roomId, user]
  );

  return { connected, typingUsers, emitTyping };
}
