import ChatConversationList from '@/components/chat/ChatConversationList';
import type { ChatRoom } from '@/lib/chatHelpers';

type ConversationListPanelProps = {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  userId: string;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectRoom: (room: ChatRoom) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  onNewChat: () => void;
  isClient: boolean;
  hideOnMobileWhenActive: boolean;
};

export default function ConversationListPanel({
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
  hideOnMobileWhenActive,
}: ConversationListPanelProps) {
  return (
    <ChatConversationList
      rooms={rooms}
      activeRoomId={activeRoomId}
      userId={userId}
      search={search}
      onSearchChange={onSearchChange}
      onSelectRoom={onSelectRoom}
      showArchived={showArchived}
      onToggleArchived={onToggleArchived}
      onNewChat={onNewChat}
      isClient={isClient}
      className={hideOnMobileWhenActive ? 'hidden md:flex' : 'flex'}
    />
  );
}
