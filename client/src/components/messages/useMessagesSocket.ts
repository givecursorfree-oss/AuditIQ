import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { ChatMessage } from '@/lib/chatHelpers';
import { useChatSocket } from '@/hooks/useChatSocket';

type UseMessagesSocketOptions = {
  activeRoomId: string | null;
  activeRoomIdForFetch: string | undefined;
  showArchived: boolean;
  inChatSearch: string;
  appendMessage: (msg: ChatMessage) => void;
  refreshRooms: (opts?: { includeArchived?: boolean }) => Promise<void>;
  fetchMessages: (roomId: string, q?: string) => Promise<void>;
};

export function useMessagesSocket({
  activeRoomId,
  activeRoomIdForFetch,
  showArchived,
  inChatSearch,
  appendMessage,
  refreshRooms,
  fetchMessages,
}: UseMessagesSocketOptions) {
  const { user } = useAuth();

  const onMessage = useCallback(
    (msg: ChatMessage) => {
      if (msg.senderId !== user?.id) appendMessage(msg);
      void refreshRooms({ includeArchived: showArchived });
    },
    [appendMessage, refreshRooms, showArchived, user?.id]
  );

  const onRoomsUpdated = useCallback(() => {
    void refreshRooms({ includeArchived: showArchived });
  }, [refreshRooms, showArchived]);

  const onReaction = useCallback(() => {
    if (activeRoomIdForFetch) void fetchMessages(activeRoomIdForFetch, inChatSearch);
  }, [activeRoomIdForFetch, fetchMessages, inChatSearch]);

  return useChatSocket({
    roomId: activeRoomId,
    onMessage,
    onRoomsUpdated,
    onReaction,
  });
}
