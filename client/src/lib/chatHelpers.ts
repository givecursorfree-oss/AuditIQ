export type ChatUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatar?: string;
  isOnline?: boolean;
  presenceStatus?: 'online' | 'offline' | 'maintenance' | 'degraded';
  lastSeenAt?: string | null;
  role?: string;
};

export function formatLastSeen(lastSeenAt?: string | null): string | null {
  if (!lastSeenAt) return null;
  const d = new Date(lastSeenAt);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Last seen today at ${time}`;
  return `Last seen ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${time}`;
}

export type ChatReaction = {
  emoji: 'thumbsup' | 'check' | 'question';
  userId: string;
  userName: string;
};

export type ChatReplyParent = {
  id: string;
  content: string;
  messageType?: string;
  senderName: string;
};

export type ChatMessage = {
  id: string;
  content?: string;
  type: 'TEXT' | 'FILE' | 'SYSTEM' | 'VOICE';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  sender: ChatUser;
  senderId: string;
  createdAt: string;
  isPinned?: boolean;
  isStarred?: boolean;
  isDeleted?: boolean;
  parentId?: string;
  parent?: ChatReplyParent | null;
  reactions?: ChatReaction[];
  forwardedFromSenderName?: string;
  forwardedFromMessageId?: string;
};

export type ChatRoom = {
  id: string;
  name?: string;
  type: 'DM' | 'GROUP' | 'CHANNEL';
  engagementId?: string | null;
  participants: { userId: string; user: ChatUser }[];
  lastMessage?: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
  isMuted?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
};

export const REACTION_LABEL: Record<ChatReaction['emoji'], string> = {
  thumbsup: 'Like',
  check: 'Acknowledged',
  question: 'Question',
};

/** Custom reaction icons (served from /public/chat-reactions). */
export const REACTION_ICON_SRC: Record<ChatReaction['emoji'], string> = {
  thumbsup: '/chat-reactions/thumbsup.png',
  check: '/chat-reactions/check.png',
  question: '/chat-reactions/question.png',
};

/** Strip decorative emoji prefixes from legacy engagement channel names. */
function sanitizeChatRoomName(name: string | null | undefined): string | undefined {
  if (name == null || name === '') return undefined;
  const cleaned = name
    .replace(/^[\s\u{1F4C1}\u{1F4C2}\u{1F4CE}\u{1F5C2}\u{1F4C4}]+/u, '')
    .replace(/^\p{Extended_Pictographic}+\s*/u, '')
    .trim();
  return cleaned || name.trim();
}

export const CHAT_ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'HR', 'Client'] as const;

export function getRoomName(room: ChatRoom, userId: string): string {
  if (room.name) return sanitizeChatRoomName(room.name) ?? room.name;
  if (room.type === 'DM') {
    const other = room.participants.find((p) => p.userId !== userId);
    return other?.user.name || 'Direct Message';
  }
  return room.participants.map((p) => p.user.name.split(' ')[0]).join(', ');
}

export function getRoomSubtitle(room: ChatRoom, userId: string): string {
  const last = room.lastMessage;
  if (last) {
    if (last.type === 'SYSTEM') {
      if (room.engagementId) return 'Engagement updates';
      return last.content || 'System update';
    }
    return messagePreview(room, userId);
  }
  if (room.engagementId) {
    const n = room.participants.length;
    return n > 0 ? `Engagement channel · ${n} member${n === 1 ? '' : 's'}` : 'Engagement channel';
  }
  return 'Direct message';
}

export function messagePreview(room: ChatRoom, userId: string): string {
  const last = room.lastMessage;
  if (!last) return 'New message';
  if (last.type === 'FILE') return last.senderId === userId ? 'You sent an attachment' : `${last.sender?.name?.split(' ')[0] || 'Team'} sent an attachment`;
  if (last.type === 'VOICE') return last.senderId === userId ? 'You sent a voice message' : `${last.sender?.name?.split(' ')[0] || 'Team'} sent a voice message`;
  if (last.type === 'SYSTEM') return last.content || 'System message';
  const text = last.content?.slice(0, 120) || 'New message';
  if (last.senderId === userId) return text === 'New message' ? 'You sent a message' : text;
  const who = last.sender?.name?.split(' ')[0] || 'Team';
  return `${who}: ${text}`;
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
