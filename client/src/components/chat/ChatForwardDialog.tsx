import { useState } from 'react';
import { PaperPlaneTilt as Send } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ChatMessage, ChatRoom } from '@/lib/chatHelpers';
import { getRoomName, getRoomSubtitle } from '@/lib/chatHelpers';

type ChatForwardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ChatMessage | null;
  rooms: ChatRoom[];
  currentRoomId: string;
  userId: string;
  onForward: (targetRoomId: string) => Promise<void>;
};

export default function ChatForwardDialog({
  open,
  onOpenChange,
  message,
  rooms,
  currentRoomId,
  userId,
  onForward,
}: ChatForwardDialogProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = rooms.filter((r) => r.id !== currentRoomId);

  const handleSelect = async (roomId: string) => {
    setSending(true);
    setError(null);
    try {
      await onForward(roomId);
      onOpenChange(false);
    } catch {
      setError('Could not forward message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const preview =
    message?.type === 'FILE'
      ? `Attachment: ${message.fileName || 'file'}`
      : message?.content?.slice(0, 80) || 'Message';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-base font-semibold">Forward message</DialogTitle>
          <p className="text-xs text-foreground-muted mt-1 truncate">{preview}</p>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto p-2">
          {targets.length === 0 ? (
            <p className="text-sm text-foreground-muted text-center py-8">
              No other conversations available.
            </p>
          ) : (
            targets.map((room) => (
              <button
                key={room.id}
                type="button"
                disabled={sending}
                onClick={() => handleSelect(room.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-hover-bg text-left disabled:opacity-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  {getRoomName(room, userId).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {getRoomName(room, userId)}
                  </p>
                  <p className="text-xs text-foreground-muted truncate">
                    {getRoomSubtitle(room, userId)}
                  </p>
                </div>
                <Send size={16} className="text-primary shrink-0" />
              </button>
            ))
          )}
        </div>

        {error && (
          <p className="text-xs text-danger px-4 pb-3">{error}</p>
        )}

        <div className="border-t border-border p-3 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
