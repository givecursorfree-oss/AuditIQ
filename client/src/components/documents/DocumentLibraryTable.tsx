import { Clock, User as UserIcon } from '@phosphor-icons/react';
import type { Document } from '@/types';
import DocumentThumbnail from '@/components/DocumentThumbnail';
import SearchHighlight from '@/components/SearchHighlight';
import { DocumentActionsMenu } from '@/components/documents/DocumentActionsMenu';
import {
  PREVIEWABLE_EXTS,
  formatSize,
  getExt,
  getFileConfig,
  timeAgo,
} from '@/components/documents/documentHelpers';
import { clickableDivProps } from '@/lib/interactiveProps';

type DocumentLibraryTableProps = {
  documents: Document[];
  viewMode: 'grid' | 'list';
  highlights: Record<string, string>;
  onPreview: (doc: Document) => void;
  onDownload: (id: string, originalName: string) => void;
  onVersionHistory: (doc: Document) => void;
  onToggleVisibility: (doc: Document) => void;
  onOcr?: (doc: Document) => void;
  onDelete: (id: string) => void;
};

function isPdfDoc(doc: Document): boolean {
  return doc.mimeType === 'application/pdf' || doc.originalName.toLowerCase().endsWith('.pdf');
}

export default function DocumentLibraryTable({
  documents,
  viewMode,
  highlights,
  onPreview,
  onDownload,
  onVersionHistory,
  onToggleVisibility,
  onOcr,
  onDelete,
}: DocumentLibraryTableProps) {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {documents.map((doc) => {
          const ext = getExt(doc.originalName);
          const cfg = getFileConfig(doc.originalName);
          const Icon = cfg.icon;
          const canPreview = PREVIEWABLE_EXTS.includes(ext);
          const openDoc = () => (canPreview ? onPreview(doc) : onDownload(doc.id, doc.originalName));
          return (
            <div
              key={doc.id}
              className="group relative bg-card border border-border rounded-xl overflow-visible hover:shadow-md hover:border-border/80 dark:hover:border-border transition-all cursor-pointer"
              {...clickableDivProps(
                openDoc,
                canPreview ? `Preview ${doc.originalName}` : `Download ${doc.originalName}`
              )}
            >
              <div className="overflow-hidden rounded-t-xl">
                <DocumentThumbnail
                  documentId={doc.id}
                  fileName={doc.originalName}
                  bgClass={cfg.bg}
                  className="h-32"
                  alt={`Preview of ${doc.originalName}`}
                  fallback={<Icon size={36} className={cfg.color} aria-hidden />}
                />
              </div>
              <div className="absolute top-2 left-2 flex flex-col gap-1">
                <div
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${cfg.color} ${cfg.bg} backdrop-blur-sm`}
                >
                  {ext || '?'}
                </div>
                {doc.visibility === 'FIRM' && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                    Public
                  </span>
                )}
                {doc.source === 'GOOGLE_DRIVE' && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
                    Drive
                  </span>
                )}
                {doc.indexStatus === 'PENDING' && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                    Indexing…
                  </span>
                )}
                {doc.indexStatus === 'FAILED' && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                    Index failed
                  </span>
                )}
              </div>
              <div className="absolute top-2 right-2 z-10">
                <DocumentActionsMenu
                  canPreview={canPreview}
                  isFirmPublic={doc.visibility === 'FIRM'}
                  onPreview={() => onPreview(doc)}
                  onDownload={() => onDownload(doc.id, doc.originalName)}
                  onDetails={() => onPreview(doc)}
                  onVersionHistory={() => onVersionHistory(doc)}
                  onToggleVisibility={() => void onToggleVisibility(doc)}
                  onOcr={onOcr && isPdfDoc(doc) ? () => onOcr(doc) : undefined}
                  onDelete={() => void onDelete(doc.id)}
                />
              </div>
              <div className="p-2.5">
                <p className="text-xs font-medium text-foreground truncate leading-tight" title={doc.originalName}>
                  {doc.originalName}
                </p>
                {highlights[doc.id] && (
                  <SearchHighlight
                    text={highlights[doc.id]}
                    className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2"
                  />
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  {doc.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface text-muted-foreground font-medium">
                      {doc.category}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">{formatSize(doc.size)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock size={10} /> {timeAgo(doc.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="table-responsive rounded-xl border border-border bg-card">
      <div className="grid min-w-[560px] grid-cols-[1fr_100px_100px_80px_90px_40px] gap-2 border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span>Name</span>
        <span>Category</span>
        <span className="text-center">Size</span>
        <span className="text-center">Version</span>
        <span>Modified</span>
        <span></span>
      </div>
      {documents.map((doc) => {
        const ext = getExt(doc.originalName);
        const cfg = getFileConfig(doc.originalName);
        const Icon = cfg.icon;
        const canPreview = PREVIEWABLE_EXTS.includes(ext);
        const openDoc = () => (canPreview ? onPreview(doc) : onDownload(doc.id, doc.originalName));
        return (
          <div
            key={doc.id}
            className="group grid min-w-[560px] grid-cols-[1fr_100px_100px_80px_90px_40px] gap-2 items-center border-b border-border px-4 py-2.5 transition-colors last:border-b-0 hover:bg-hover-bg cursor-pointer"
            {...clickableDivProps(
              openDoc,
              canPreview ? `Preview ${doc.originalName}` : `Download ${doc.originalName}`
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <DocumentThumbnail
                documentId={doc.id}
                fileName={doc.originalName}
                bgClass={cfg.bg}
                className="w-10 h-12 rounded-lg shrink-0"
                alt=""
                fallback={<Icon size={16} className={cfg.color} aria-hidden />}
              />
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate font-medium">{doc.originalName}</p>
                {highlights[doc.id] && (
                  <SearchHighlight
                    text={highlights[doc.id]}
                    className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5"
                  />
                )}
                {doc.uploadedBy && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <UserIcon size={9} /> {doc.uploadedBy.firstName} {doc.uploadedBy.lastName}
                  </p>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {doc.category && (
                <span className="px-1.5 py-0.5 rounded-full bg-surface text-muted-foreground text-[10px] font-medium">
                  {doc.category}
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground text-center">{formatSize(doc.size)}</span>
            <span className="text-xs text-muted-foreground text-center">v{doc.version}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(doc.createdAt)}</span>
            <div className="relative flex items-center justify-center">
              <DocumentActionsMenu
                canPreview={canPreview}
                isFirmPublic={doc.visibility === 'FIRM'}
                onPreview={() => onPreview(doc)}
                onDownload={() => onDownload(doc.id, doc.originalName)}
                onVersionHistory={() => onVersionHistory(doc)}
                onToggleVisibility={() => void onToggleVisibility(doc)}
                onOcr={onOcr && isPdfDoc(doc) ? () => onOcr(doc) : undefined}
                onDelete={() => void onDelete(doc.id)}
                triggerClassName="opacity-100"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
