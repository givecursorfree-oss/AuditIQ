import { useEffect, useState, useCallback } from 'react';
import { DownloadSimple as Download, FileText, WarningCircle as AlertCircle } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import api from '@/services/api';
import type { ChatMessage } from '@/lib/chatHelpers';
import { chatFileUrl, filePreviewKind } from '@/lib/chatMessageUtils';

type ChatFilePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  message: ChatMessage | null;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function ChatFilePreviewDialog({
  open,
  onOpenChange,
  roomId,
  message,
}: ChatFilePreviewDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revokePreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  useEffect(() => {
    if (!open || !message || message.type !== 'FILE') {
      revokePreview();
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    revokePreview();

    (async () => {
      try {
        const { data } = await api.get(chatFileUrl(roomId, message.id, true), {
          responseType: 'blob',
        });
        if (cancelled) return;
        const url = URL.createObjectURL(data);
        setPreviewUrl(url);
      } catch {
        if (!cancelled) setError('Could not load preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, message?.id, roomId]);

  useEffect(() => {
    if (!open) revokePreview();
  }, [open, revokePreview]);

  const handleDownload = async () => {
    if (!message) return;
    try {
      const { data } = await api.get(chatFileUrl(roomId, message.id, false), {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = message.fileName || 'attachment';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed.');
    }
  };

  const kind = filePreviewKind(message?.mimeType);
  const fileName = message?.fileName || 'Attachment';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-sm font-semibold truncate pr-8">{fileName}</DialogTitle>
          <div className="flex items-center gap-2 absolute right-12 top-3">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleDownload}>
              <Download size={16} />
              Download
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-[240px] max-h-[70vh] flex flex-col items-center justify-center bg-surface-muted/50 p-4">
          {loading && (
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          {error && !loading && (
            <div className="text-center text-foreground-muted">
              <AlertCircle size={32} className="mx-auto mb-2 text-danger" />
              <p className="text-sm">{error}</p>
              <Button type="button" className="mt-3" size="sm" onClick={handleDownload}>
                Download instead
              </Button>
            </div>
          )}
          {!loading && !error && previewUrl && kind === 'image' && (
            <img
              src={previewUrl}
              alt={fileName}
              className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-md"
            />
          )}
          {!loading && !error && previewUrl && kind === 'pdf' && (
            <iframe
              title={fileName}
              src={previewUrl}
              className="w-full h-[65vh] rounded-lg border border-border bg-white"
            />
          )}
          {!loading && !error && previewUrl && kind === 'unsupported' && (
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <FileText size={32} className="text-primary" />
              </div>
              <p className="font-medium text-foreground">{fileName}</p>
              <p className="text-sm text-foreground-muted mt-1">
                {message?.fileSize ? formatSize(message.fileSize) : 'Document'}
              </p>
              <p className="text-xs text-foreground-muted mt-2">
                Preview is not available for this file type. Download to open it on your device.
              </p>
              <Button type="button" className="mt-4 gap-2" onClick={handleDownload}>
                <Download size={18} />
                Download file
              </Button>
            </div>
          )}
        </div>

        {message?.fileSize != null && (
          <p className="text-xs text-foreground-muted text-center py-2 border-t border-border">
            {formatSize(message.fileSize)}
            {message.mimeType ? ` · ${message.mimeType}` : ''}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
