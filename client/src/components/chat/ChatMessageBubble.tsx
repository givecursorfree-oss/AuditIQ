import {
  FileText,
  Image as ImageIcon,
  DotsThreeVertical as MoreVertical,
  PaperPlaneTilt as Forward,
  Trash,
  PushPin as Pin,
  ArrowBendUpRight,
} from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checks as CheckCheck } from '@phosphor-icons/react';
import type { ChatMessage } from '@/lib/chatHelpers';

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
  isMe: boolean;
  showSender: boolean;
  canDelete: boolean;
  onPreviewFile: (msg: ChatMessage) => void;
  onForward: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  onTogglePin: (msgId: string, isPinned: boolean) => void;
};

export default function ChatMessageBubble({
  msg,
  isMe,
  showSender,
  canDelete,
  onPreviewFile,
  onForward,
  onDelete,
  onTogglePin,
}: ChatMessageBubbleProps) {
  if (msg.isDeleted) {
    return (
      <div className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''} mt-0.5`}>
        {!isMe && <div className="w-7 shrink-0" />}
        <div className={`max-w-[65%] ${isMe ? 'items-end' : 'items-start'}`}>
          <div
            className={`rounded-2xl px-3 py-2 text-sm italic opacity-70 ${
              isMe ? 'bg-primary/40 text-white/80' : 'bg-hover-bg text-foreground-muted border border-border'
            }`}
          >
            This message was deleted
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 group ${isMe ? 'flex-row-reverse' : ''} ${showSender ? 'mt-3' : 'mt-0.5'}`}>
      {!isMe && showSender ? (
        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
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
                ? 'bg-primary text-white rounded-br-md'
                : 'bg-card border border-border text-foreground rounded-bl-md shadow-sm'
            }`}
          >
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

            {msg.type === 'TEXT' && (
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
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
                    isMe ? 'bg-white/15' : 'bg-primary/10'
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
              {isMe && <CheckCheck size={12} className="text-white/50" />}
            </div>
          </div>

          {msg.type !== 'SYSTEM' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-md hover:bg-hover-bg text-foreground-muted shrink-0 transition-opacity"
                  aria-label="Message options"
                >
                  <MoreVertical size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isMe ? 'end' : 'start'} className="w-44">
                <DropdownMenuItem onClick={() => onForward(msg)} className="gap-2 cursor-pointer">
                  <Forward size={16} />
                  Forward
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onTogglePin(msg.id, Boolean(msg.isPinned))}
                  className="gap-2 cursor-pointer"
                >
                  <Pin size={16} />
                  {msg.isPinned ? 'Unpin' : 'Pin'}
                </DropdownMenuItem>
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
          )}
        </div>
      </div>
    </div>
  );
}
