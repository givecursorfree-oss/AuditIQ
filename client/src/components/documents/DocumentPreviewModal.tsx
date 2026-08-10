import { DownloadSimple as Download, X } from '@phosphor-icons/react';
import DocumentPdfPreview from '@/components/DocumentPdfPreview';
import DocumentDocxPreview from '@/components/DocumentDocxPreview';
import { getFileConfig, type DocumentPreviewState } from '@/components/documents/documentHelpers';
import { modalBackdropProps } from '@/lib/interactiveProps';

type DocumentPreviewModalProps = {
  preview: DocumentPreviewState | null;
  onClose: () => void;
};

export default function DocumentPreviewModal({ preview, onClose }: DocumentPreviewModalProps) {
  if (!preview) return null;

  const cfg = getFileConfig(preview.name);
  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" {...modalBackdropProps(onClose, 'Close preview')}>
      <div className="relative w-full max-w-5xl h-[88vh] mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-card border border-border rounded-t-xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Icon size={18} className={cfg.color} />
            <h3 className="text-sm font-semibold text-foreground truncate">{preview.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            {preview.url && (
              <button
                type="button"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = preview.url;
                  a.download = preview.name;
                  a.click();
                }}
                className="p-1.5 rounded-lg hover:bg-hover-bg text-muted-foreground hover:text-primary"
                title="Download"
              >
                <Download size={16} />
              </button>
            )}
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-hover-bg text-muted-foreground">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="bg-card border border-t-0 border-border rounded-b-xl overflow-hidden h-[calc(88vh-52px)]">
          {preview.type === 'pdf' ? (
            <DocumentPdfPreview url={preview.url} searchQuery={preview.searchQuery || ''} />
          ) : preview.type === 'docx' ? (
            <DocumentDocxPreview html={preview.htmlContent || ''} searchQuery={preview.searchQuery || ''} />
          ) : (
            <div className="flex items-center justify-center h-full p-6 bg-surface">
              <img
                src={preview.url}
                alt={preview.name}
                loading="lazy"
                className="max-w-full max-h-full object-contain rounded shadow-lg"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
