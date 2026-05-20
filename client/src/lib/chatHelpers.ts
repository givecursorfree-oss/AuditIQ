export type ChatUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatar?: string;
  isOnline?: boolean;
  presenceStatus?: 'online' | 'offline' | 'maintenance' | 'degraded';
};

export type ChatMessage = {
  id: string;
  content?: string;
  type: 'TEXT' | 'FILE' | 'SYSTEM';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  sender: ChatUser;
  senderId: string;
  createdAt: string;
  isPinned?: boolean;
  isDeleted?: boolean;
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
};

export const CHAT_ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'Client'] as const;

/** @deprecated Import from ../lib/attendancePopup */
export const ATTENDANCE_AUTO_ROLES = ['Partner', 'Admin', 'Manager', 'Staff'] as const;

export function getRoomName(room: ChatRoom, userId: string): string {
  if (room.name) return room.name;
  if (room.type === 'DM') {
    const other = room.participants.find((p) => p.userId !== userId);
    return other?.user.name || 'Direct Message';
  }
  return room.participants.map((p) => p.user.name.split(' ')[0]).join(', ');
}

export function getRoomSubtitle(room: ChatRoom, userId: string): string {
  const last = room.lastMessage;
  if (last) {
    if (last.type === 'FILE') return '📎 Attachment';
    if (last.type === 'SYSTEM') return last.content || 'System update';
    const preview = last.content?.slice(0, 48) || '';
    if (last.senderId === userId) return preview || 'You sent a message';
    return `${last.sender?.name?.split(' ')[0] || 'Team'}: ${preview}`;
  }
  if (room.engagementId) {
    const advisor = room.participants.find((p) => p.userId !== userId);
    return advisor ? `With ${advisor.user.name}` : 'Engagement thread';
  }
  return 'Direct message';
}

export function messagePreview(room: ChatRoom, userId: string): string {
  const last = room.lastMessage;
  if (!last) return 'New message';
  if (last.type === 'FILE') return 'Sent an attachment';
  if (last.type === 'SYSTEM') return last.content || 'System message';
  return last.content?.slice(0, 120) || 'New message';
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
