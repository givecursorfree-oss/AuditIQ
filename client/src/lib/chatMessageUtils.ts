import type { ChatMessage } from './chatHelpers';

export type FilePreviewKind = 'image' | 'pdf' | 'unsupported';

export function mapApiMessage(m: Record<string, unknown>): ChatMessage {
  const sender = m.sender as {
    id?: string;
    firstName?: string;
    lastName?: string;
    initials?: string;
    name?: string;
  } | undefined;
  const senderName =
    sender?.name || [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || 'Team';
  const msgType = String(m.messageType || m.type || 'text').toUpperCase();
  const isDeleted = Boolean(m.isDeleted);

  return {
    id: String(m.id),
    content: isDeleted ? undefined : (m.content as string | undefined),
    type: (msgType === 'FILE' ? 'FILE' : msgType === 'SYSTEM' ? 'SYSTEM' : 'TEXT') as ChatMessage['type'],
    fileName: isDeleted ? undefined : (m.fileName as string | undefined),
    fileSize: isDeleted ? undefined : (m.fileSize as number | undefined),
    mimeType: isDeleted ? undefined : (m.fileMimeType as string | undefined),
    sender: {
      id: String(m.senderId || sender?.id || ''),
      name: senderName,
      email: '',
      initials: sender?.initials || senderName.slice(0, 2).toUpperCase(),
    },
    senderId: String(m.senderId || sender?.id || ''),
    createdAt: String(m.createdAt),
    isPinned: Boolean(m.isPinned),
    isDeleted,
    forwardedFromSenderName: m.forwardedFromSenderName as string | undefined,
    forwardedFromMessageId: m.forwardedFromMessageId as string | undefined,
  };
}

export function filePreviewKind(mimeType?: string): FilePreviewKind {
  if (!mimeType) return 'unsupported';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'unsupported';
}

export function chatFileUrl(roomId: string, messageId: string, inline: boolean): string {
  const base = `/chat/rooms/${roomId}/messages/${messageId}/file`;
  return inline ? `${base}?disposition=inline` : base;
}
