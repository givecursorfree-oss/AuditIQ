import {
  FileText,
  Image as ImageIcon,
  DotsThreeVertical as MoreVertical,
  PaperPlaneTilt as Forward,
  Trash,
  PushPin as Pin,
  ArrowBendUpRight,
  ArrowBendUpLeft,
  Star,
} from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checks as CheckCheck } from '@phosphor-icons/react';
import {
  REACTION_ICON_SRC,
  REACTION_LABEL,
  type ChatMessage,
  type ChatReaction,
} from '@/lib/chatHelpers';
import { renderMentionSegments } from '@/lib/chatMessageUtils';
import { chatFilePublicUrl } from '@/lib/chatMessageUtils';

function ChatReactionIcon({
  kind,
  size = 20,
  className = '',
}: {
  kind: ChatReaction['emoji'];
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={REACTION_ICON_SRC[kind]}
      alt=""
      width={size}
      height={size}
      className={`inline-block object-contain ${className}`}
      draggable={false}
    />
  );
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

type ChatMessageBubbleProps = {
  msg: ChatMessage;
  roomId: string;
  isMe: boolean;
  showSender: boolean;
  canDelete: boolean;
  searchHighlight?: string;
  onPreviewFile: (msg: ChatMessage) => void;
  onForward: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  onTogglePin: (msgId: string, isPinned: boolean) => void;
  onReply?: (msg: ChatMessage) => void;
  onReact?: (msgId: string, emoji: ChatReaction['emoji']) => void;
  onToggleStar?: (msgId: string, isStarred: boolean) => void;
};

function MessageText({
  content,
  isMe,
  highlight,
}: {
  content: string;
  isMe: boolean;
  highlight?: string;
}) {
  const segments = renderMentionSegments(content);
  const hl = highlight?.trim().toLowerCase();

  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {segments.map((seg) => {
        const segKey = `${seg.type}:${seg.offset}`;
        if (seg.type === 'mention') {
          return (
            <span
              key={segKey}
              className={`font-semibold ${isMe ? 'text-white' : 'text-[var(--color-brand-primary)] dark:text-blue-400'}`}
            >
              {seg.value}
            </span>
          );
        }
        if (!hl) {
          return (
            <span key={segKey} className={isMe ? 'text-white/95' : undefined}>
              {seg.value}
            </span>
          );
        }
        const lower = seg.value.toLowerCase();
        const idx = lower.indexOf(hl);
        if (idx < 0) return <span key={segKey}>{seg.value}</span>;
        return (
          <span key={segKey}>
            {seg.value.slice(0, idx)}
            <mark className="bg-yellow-200/80 dark:bg-yellow-500/30 rounded px-0.5">
              {seg.value.slice(idx, idx + hl.length)}
            </mark>
            {seg.value.slice(idx + hl.length)}
          </span>
        );
      })}
    </p>
  );
}

export default function ChatMessageBubble({
  msg,
  roomId,
  isMe,
  showSender,
  canDelete,
  searchHighlight,
  onPreviewFile,
  onForward,
  onDelete,
  onTogglePin,
  onReply,
  onReact,
  onToggleStar,
}: ChatMessageBubbleProps) {
  if (msg.isDeleted) {
    return (
      <div className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''} mt-0.5`}>
        {!isMe && <div className="w-7 shrink-0" />}
        <div className={`max-w-[65%] ${isMe ? 'items-end' : 'items-start'}`}>
          <div
            className={`rounded-2xl px-3 py-2 text-sm italic opacity-70 ${
              isMe
                ? 'bg-[var(--color-brand-primary)]/30 text-foreground-muted'
                : 'bg-muted text-foreground-muted border border-border'
            }`}
          >
            This message was deleted
          </div>
        </div>
      </div>
    );
  }

  const reactionCounts = (msg.reactions || []).reduce(
    (acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className={`flex gap-2 group ${isMe ? 'flex-row-reverse' : ''} ${showSender ? 'mt-3' : 'mt-0.5'}`}>
      {!isMe && showSender ? (
        <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
          {msg.sender?.initials || '?'}
        </div>
      ) : !isMe ? (
        <div className="w-7 shrink-0" />
      ) : null}

      <div className={`max-w-[65%] min-w-[120px] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
        {showSender && !isMe && (
          <p className="text-[11px] font-semibold text-foreground-muted mb-0.5 ml-1">
            {msg.sender?.name}
          </p>
        )}

        <div className={`flex items-start gap-1 ${isMe ? 'flex-row-reverse' : ''}`}>
          <div
            className={`relative rounded-2xl px-3 py-2 ${
              isMe
                ? 'bg-[var(--color-brand-primary)] text-white rounded-br-md shadow-sm'
                : 'bg-muted text-foreground border border-border rounded-bl-md'
            }`}
          >
            {msg.parent && (
              <div
                className={`text-[11px] mb-2 pl-2 border-l-2 ${
                  isMe ? 'border-white/40 text-white/80' : 'border-border text-foreground-muted'
                }`}
              >
                <p className="font-medium">{msg.parent.senderName}</p>
                <p className="truncate opacity-90">{msg.parent.content?.slice(0, 120) || 'Attachment'}</p>
              </div>
            )}

            {msg.forwardedFromSenderName && (
              <div
                className={`flex items-center gap-1 text-[10px] font-medium mb-1 pb-1 border-b ${
                  isMe ? 'border-white/20 text-white/70' : 'border-border text-foreground-muted'
                }`}
              >
                <ArrowBendUpRight size={12} className="shrink-0" />
                Forwarded from {msg.forwardedFromSenderName}
              </div>
            )}

            {msg.type === 'TEXT' && msg.content && (
              <MessageText content={msg.content} isMe={isMe} highlight={searchHighlight} />
            )}

            {msg.type === 'VOICE' && (
              <audio
                controls
                className="max-w-full h-8"
                src={chatFilePublicUrl(roomId, msg.id, true)}
                aria-label="Voice message"
              >
                <track kind="captions" />
              </audio>
            )}

            {msg.type === 'FILE' && (
              <button
                type="button"
                onClick={() => onPreviewFile(msg)}
                className={`flex items-center gap-2.5 py-0.5 w-full text-left rounded-lg transition-opacity hover:opacity-90 ${
                  isMe ? 'text-white/90' : 'text-foreground'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isMe ? 'bg-white/15' : 'bg-surface-muted'
                  }`}
                >
                  {msg.mimeType?.startsWith('image/') ? (
                    <ImageIcon size={16} />
                  ) : (
                    <FileText size={16} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{msg.fileName}</p>
                  <p className={`text-[10px] ${isMe ? 'text-white/60' : 'text-foreground-muted'}`}>
                    {msg.fileSize ? formatSize(msg.fileSize) : 'Tap to preview'}
                  </p>
                </div>
              </button>
            )}

            <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
              <span className={`text-[10px] ${isMe ? 'text-white/50' : 'text-foreground-muted'}`}>
                {formatTime(msg.createdAt)}
              </span>
              {msg.isStarred && (
                <Star size={10} weight="fill" className={isMe ? 'text-yellow-200' : 'text-amber-500'} />
              )}
              {isMe && <CheckCheck size={12} className="text-white/50" />}
            </div>
          </div>

          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onReply && (
              <button
                type="button"
                title="Reply"
                aria-label="Reply"
                onClick={() => onReply(msg)}
                className="p-1 rounded-md hover:bg-hover-bg text-foreground-muted"
              >
                <ArrowBendUpLeft size={14} />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-hover-bg text-foreground-muted"
                  aria-label="Message options"
                >
                  <MoreVertical size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isMe ? 'end' : 'start'} className="w-48">
                {onReply && (
                  <DropdownMenuItem onClick={() => onReply(msg)} className="gap-2 cursor-pointer">
                    <ArrowBendUpLeft size={16} />
                    Reply
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onForward(msg)} className="gap-2 cursor-pointer">
                  <Forward size={16} />
                  Forward
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onTogglePin(msg.id, Boolean(msg.isPinned))}
                  className="gap-2 cursor-pointer"
                >
                  <Pin size={16} />
                  {msg.isPinned ? 'Unpin in room' : 'Pin in room'}
                </DropdownMenuItem>
                {onToggleStar && (
                  <DropdownMenuItem
                    onClick={() => onToggleStar(msg.id, Boolean(msg.isStarred))}
                    className="gap-2 cursor-pointer"
                  >
                    <Star size={16} />
                    {msg.isStarred ? 'Unstar' : 'Star message'}
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(msg)}
                      className="gap-2 cursor-pointer text-danger focus:text-danger"
                    >
                      <Trash size={16} />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {(['thumbsup', 'check', 'question'] as const).map((emoji) => (
            <button
              key={emoji}
              type="button"
              title={REACTION_LABEL[emoji]}
              aria-label={REACTION_LABEL[emoji]}
              onClick={() => onReact?.(msg.id, emoji)}
              className="p-0.5 rounded-md opacity-70 hover:opacity-100 hover:bg-hover-bg transition-opacity"
            >
              <ChatReactionIcon kind={emoji} size={22} />
            </button>
          ))}
          {Object.entries(reactionCounts).map(([emoji, count]) => {
            const kind = emoji as ChatReaction['emoji'];
            const src = REACTION_ICON_SRC[kind];
            return (
              <span
                key={emoji}
                className="inline-flex items-center gap-1 text-[10px] bg-surface-muted border border-border rounded-full pl-1 pr-2 py-0.5"
              >
                {src ? (
                  <ChatReactionIcon kind={kind} size={16} />
                ) : (
                  <span>{emoji}</span>
                )}
                <span className="font-medium tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
