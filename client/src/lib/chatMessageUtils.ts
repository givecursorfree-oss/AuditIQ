import type { ChatMessage, ChatReaction } from './chatHelpers';

/** Consistent date for chat separators and system messages */
export function formatChatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Normalize legacy system message dates (e.g. 23/5/2026 → 23 May 2026) */
export function formatSystemMessageContent(content: string): string {
  const stageMatch = content.match(/^(Stage updated to:\s*)(.+?)(\s*[—–-]\s*)(.+)$/i);
  if (!stageMatch) return content;

  const prefix = stageMatch[1];
  const stage = stageMatch[2].trim();
  const sep = ' — ';
  let datePart = stageMatch[4].trim();

  const parsed = parseFlexibleDate(datePart);
  if (parsed) {
    datePart = parsed.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  return `${prefix}${stage}${sep}${datePart}`;
}

function parseFlexibleDate(raw: string): Date | null {
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime()) && raw.length > 6) return d;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const dt = new Date(year, month, day);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

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
  const parent = m.parent as {
    id?: string;
    content?: string;
    messageType?: string;
    senderName?: string;
  } | null | undefined;

  let type: ChatMessage['type'] = 'TEXT';
  if (msgType === 'FILE') type = 'FILE';
  else if (msgType === 'SYSTEM') type = 'SYSTEM';
  else if (msgType === 'VOICE') type = 'VOICE';

  const reactions: ChatReaction[] | undefined = Array.isArray(m.reactions)
    ? (m.reactions as { emoji: string; userId: string; userName?: string }[]).map((r) => ({
        emoji: r.emoji as ChatReaction['emoji'],
        userId: r.userId,
        userName: r.userName || '',
      }))
    : undefined;

  return {
    id: String(m.id),
    content: isDeleted ? undefined : (m.content as string | undefined),
    type,
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
    isStarred: Boolean(m.isStarred),
    isDeleted,
    parentId: m.parentId as string | undefined,
    parent: parent?.id
      ? {
          id: String(parent.id),
          content: String(parent.content || ''),
          messageType: parent.messageType,
          senderName: String(parent.senderName || ''),
        }
      : null,
    reactions,
    forwardedFromSenderName: m.forwardedFromSenderName as string | undefined,
    forwardedFromMessageId: m.forwardedFromMessageId as string | undefined,
  };
}

/** Highlight @mentions in message text */
export function renderMentionSegments(
  text: string
): Array<{ type: 'text' | 'mention'; value: string; offset: number }> {
  const parts: Array<{ type: 'text' | 'mention'; value: string; offset: number }> = [];
  const re = /@(Manager|Client|Partner|Admin|Staff|Intern|[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)?)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', value: text.slice(last, m.index), offset: last });
    }
    parts.push({ type: 'mention', value: m[0], offset: m.index });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last), offset: last });
  return parts.length ? parts : [{ type: 'text', value: text, offset: 0 }];
}

export function filePreviewKind(mimeType?: string): FilePreviewKind {
  if (!mimeType) return 'unsupported';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'unsupported';
}

function chatFilePath(roomId: string, messageId: string, inline: boolean): string {
  const base = `/chat/rooms/${roomId}/messages/${messageId}/file`;
  return inline ? `${base}?disposition=inline` : base;
}

/** Relative path for axios (`baseURL` is `/api`). */
export function chatFileUrl(roomId: string, messageId: string, inline: boolean): string {
  return chatFilePath(roomId, messageId, inline);
}

/** Absolute browser URL for `<img src>` and other non-axios fetches. */
export function chatFilePublicUrl(roomId: string, messageId: string, inline: boolean): string {
  return `/api${chatFilePath(roomId, messageId, inline)}`;
}
