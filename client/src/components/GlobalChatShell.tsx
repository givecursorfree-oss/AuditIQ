import { useAuth } from '../context/AuthContext';
import { useGlobalChatOptional } from '../context/GlobalChatContext';
import { DynamicIslandChat, type IslandChatRoom } from './ui/dynamic-island-chat';
import { TeamsMessageToastStack } from './ui/teams-message-toast';
import { getRoomName, getRoomSubtitle, type ChatRoom } from '../lib/chatHelpers';

export default function GlobalChatShell() {
  const chat = useGlobalChatOptional();
  const { user } = useAuth();

  return (
    <>
      {chat?.chatEnabled && (
        <>
      <TeamsMessageToastStack
        toasts={chat.toasts}
        onDismiss={chat.dismissToast}
        onOpen={chat.openFromToast}
      />

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
