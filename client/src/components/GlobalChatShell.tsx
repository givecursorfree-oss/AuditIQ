import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGlobalChatOptional } from '../context/GlobalChatContext';
import { DynamicIslandChat, type IslandChatRoom } from './ui/dynamic-island-chat';
import { getRoomName, getRoomSubtitle, type ChatRoom } from '../lib/chatHelpers';

export default function GlobalChatShell() {
  const chat = useGlobalChatOptional();
  const { user } = useAuth();
  const location = useLocation();
  const onMessagesPage =
    location.pathname === '/messages' || location.pathname === '/client/messages';

  if (onMessagesPage) return null;

  return (
    <>
      {chat?.chatEnabled && (
        <>
      <DynamicIslandChat
        rooms={chat!.rooms as IslandChatRoom[]}
        activeRoomId={chat!.activeRoomId}
        userId={user?.id || ''}
        isClient={chat!.isClient}
        roomFilter={chat!.roomFilter}
        onRoomFilterChange={chat!.setRoomFilter}
        search={chat!.roomSearch}
        onSearchChange={chat!.setRoomSearch}
        onSelectRoom={(room) => chat!.selectRoom(room as ChatRoom)}
        onNewChat={
          !chat!.isClient
            ? () => {
                chat!.openMessagesPage();
                window.dispatchEvent(new CustomEvent('auditiq:open-new-chat'));
              }
            : undefined
        }
        onOpenFullChat={chat!.openMessagesPage}
        getRoomName={(room, id) => getRoomName(room as ChatRoom, id)}
        getRoomSubtitle={(room, id) => getRoomSubtitle(room as ChatRoom, id)}
        emptyLabel={chat!.isClient ? 'Message your team' : 'Messages'}
        headerLabel={chat!.isClient ? 'YOUR TEAM CHATS' : 'CONVERSATIONS'}
      />
        </>
      )}
    </>
  );
}
