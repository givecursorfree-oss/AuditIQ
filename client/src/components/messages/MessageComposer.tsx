import { useRef } from 'react';
import { PaperPlaneTilt as Send, Paperclip, Microphone, X } from '@phosphor-icons/react';
import ChatMentionComposer from '@/components/chat/ChatMentionComposer';
import type { ChatMessage, ChatUser } from '@/lib/chatHelpers';

type MessageComposerProps = {
  msgInput: string;
  onMsgInputChange: (value: string) => void;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  onSubmit: () => void;
  onSendFile: (file: File) => void;
  onTyping: (typing: boolean) => void;
  uploadingFile: boolean;
  fileError: string | null;
  placeholder: string;
  mentionUsers: ChatUser[];
  includeRoleMentions: boolean;
};

export default function MessageComposer({
  msgInput,
  onMsgInputChange,
  replyTo,
  onClearReply,
  onSubmit,
  onSendFile,
  onTyping,
  uploadingFile,
  fileError,
  placeholder,
  mentionUsers,
  includeRoleMentions,
}: MessageComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {replyTo && (
        <div className="px-4 py-2 border-t border-border bg-muted/50 flex items-center justify-between gap-2">
          <div className="text-xs min-w-0">
            <div className="font-medium text-foreground">Replying to {replyTo.sender?.name}</div>
            <div className="text-foreground-muted truncate">{replyTo.content?.slice(0, 80)}</div>
          </div>
          <button type="button" onClick={onClearReply} className="p-1 text-foreground-muted">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="border-t border-border p-3 bg-background shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {fileError && <p className="text-xs text-danger mb-2 px-1">{fileError}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex items-end gap-2"
        >
          <button
            type="button"
            disabled={uploadingFile}
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl hover:bg-hover-bg text-foreground-muted transition-colors shrink-0 disabled:opacity-50"
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip size={18} className={uploadingFile ? 'animate-pulse' : ''} />
          </button>
          <button
            type="button"
            disabled={uploadingFile}
            onClick={() => voiceInputRef.current?.click()}
            className="p-2.5 rounded-xl hover:bg-hover-bg text-foreground-muted shrink-0"
            title="Voice note"
            aria-label="Voice note"
          >
            <Microphone size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            aria-label="Attach file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSendFile(f);
              e.target.value = '';
            }}
          />
          <input
            ref={voiceInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            aria-label="Attach voice note"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSendFile(f);
              e.target.value = '';
            }}
          />
          <ChatMentionComposer
            value={msgInput}
            onChange={onMsgInputChange}
            onSubmit={onSubmit}
            onTyping={onTyping}
            placeholder={placeholder}
            disabled={uploadingFile}
            mentionUsers={mentionUsers}
            includeRoleMentions={includeRoleMentions}
          />
          <button
            type="submit"
            disabled={!msgInput.trim()}
            aria-label="Send message"
            className={`p-2.5 rounded-xl shrink-0 transition-colors ${
              msgInput.trim()
                ? 'bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-brand-primary-hover)]'
                : 'bg-hover-bg text-foreground-muted'
            }`}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </>
  );
}
