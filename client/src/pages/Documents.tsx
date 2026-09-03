import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  MagnifyingGlass as Search,
  UploadSimple as Upload,
  Folder,
  DownloadSimple as Download,
  X,
  CaretRight as ChevronRight,
  FolderOpen,
  SquaresFour as LayoutGrid,
  List,
  ClockCounterClockwise as History,
  CloudArrowUp,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import mammoth from 'mammoth';
import api from '@/services/api';
import type { Document, GoogleDriveStatus } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { isPrivilegedRole } from '@/lib/permissions';
import SearchStatusBanner from '@/components/SearchStatusBanner';
import { EmptyState, LoadingCenter } from '@/components/layout/StatePanels';
import GoogleDrivePanel from '@/components/GoogleDrivePanel';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import PageHeader from '@/components/layout/PageHeader';
import DocumentUploadSection from '@/components/documents/DocumentUploadSection';
import DocumentPreviewModal from '@/components/documents/DocumentPreviewModal';
import DocumentLibraryTable from '@/components/documents/DocumentLibraryTable';
import { modalBackdropProps } from '@/lib/interactiveProps';
import { Button } from '@/components/ui/button';
import {
  CATEGORIES,
  FOLDERS,
  PREVIEWABLE_EXTS,
  formatSize,
  getExt,
  getFileConfig,
  timeAgo,
  type DocumentPreviewState,
} from '@/components/documents/documentHelpers';

export default function Documents() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlights, setHighlights] = useState<Record<string, string>>({});
  const [category, setCategory] = useState('');
  const [activeFolder, setActiveFolder] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showUpload, setShowUpload] = useState(false);
  const [showDrive, setShowDrive] = useState(false);
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentPreviewState | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [versionDoc, setVersionDoc] = useState<Document | null>(null);
  const [versions, setVersions] = useState<Document[]>([]);
  const [versionUpload, setVersionUpload] = useState<Document | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [driveToast, setDriveToast] = useState<string | null>(null);

  const canManageDrive =
    user?.role === 'Partner' || user?.role === 'Admin' || user?.role === 'Manager';
  const canReindex = isPrivilegedRole(user?.role);

  const fetchDocs = useCallback(() => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (activeFolder) params.set('folder', activeFolder);
    api
      .get(`/documents?${params.toString()}`)
      .then(({ data }) => setDocuments(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [category, activeFolder]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const loadDriveStatus = useCallback(() => {
    api
      .get<GoogleDriveStatus>('/integrations/google-drive/status')
      .then(({ data }) => setDriveStatus(data))
      .catch(() => setDriveStatus(null));
  }, []);

  useEffect(() => {
    loadDriveStatus();
  }, [loadDriveStatus]);

  useEffect(() => {
    const drive = searchParams.get('drive');
    if (drive === 'connected') {
      setShowDrive(true);
      loadDriveStatus();
      setDriveToast('Google Drive connected successfully');
      setSearchParams({}, { replace: true });
    } else if (drive === 'error') {
      setShowDrive(true);
      setDriveToast('Google Drive connection failed — try again or contact your admin');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, loadDriveStatus]);

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const { data } = await api.post<{ queued: number }>('/search/reindex');
      setDriveToast(`Queued ${data.queued} document(s) for indexing`);
    } catch {
      setDriveToast('Reindex failed — requires Partner or Admin role');
    } finally {
      setReindexing(false);
    }
  };

  useEffect(() => {
    if (!search.trim()) {
      setHighlights({});
      fetchDocs();
      return;
    }
    const t = setTimeout(() => {
      setSearchLoading(true);
      const params = new URLSearchParams({ q: search });
      api
        .get('/search/documents', { params, timeout: 15000 })
        .then(({ data }) => {
          const hl: Record<string, string> = {};
          (data.results || []).forEach((r: { id: string; highlight?: string }) => {
            if (r.highlight) hl[r.id] = r.highlight;
          });
          setHighlights(hl);
          if (Array.isArray(data.documents)) {
            setDocuments(data.documents);
            return;
          }
          return api.get(`/documents?${params.toString()}`, { timeout: 10000 }).then(({ data: docs }) => {
            setDocuments(docs);
          });
        })
        .catch(() => {
          return api.get(`/documents?${params.toString()}`, { timeout: 10000 }).then(({ data: docs }) => {
            setDocuments(docs);
          });
        })
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, fetchDocs]);

  const handleToggleVisibility = async (doc: Document) => {
    const next = doc.visibility === 'FIRM' ? 'ENGAGEMENT' : 'FIRM';
    try {
      await api.patch(`/documents/${doc.id}/visibility`, { visibility: next });
      fetchDocs();
    } catch {
      await appAlert({ title: 'Update failed', message: 'Failed to update visibility.' });
    }
  };

  const filtered = useMemo(() => {
    let docs = search.trim()
      ? documents
      : documents.filter((d) => d.originalName.toLowerCase().includes(search.toLowerCase()));
    docs.sort((a, b) => {
      if (sortBy === 'name') return a.originalName.localeCompare(b.originalName);
      if (sortBy === 'size') return b.size - a.size;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return docs;
  }, [documents, search, sortBy]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    FOLDERS.forEach((f) => {
      counts[f] = 0;
    });
    documents.forEach((d) => {
      const f = d.folder || 'Current File';
      counts[f] = (counts[f] || 0) + 1;
    });
    return counts;
  }, [documents]);

  const totalSize = useMemo(() => documents.reduce((sum, d) => sum + d.size, 0), [documents]);

  const handleDownload = async (id: string, originalName: string) => {
    try {
      const { data } = await api.get(`/documents/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      await appAlert({ title: 'Download failed', message: 'Failed to download document.' });
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: 'Delete document',
      message: 'Delete this document? This cannot be undone.',
      destructive: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/documents/${id}`);
      fetchDocs();
    } catch (e) {
      console.error(e);
    }
  };

  const highlightQueryFor = (docId: string) => {
    if (search.trim()) return search.trim();
    const snip = highlights[docId];
    if (!snip) return '';
    const marks = [...snip.matchAll(/<mark>([\s\S]*?)<\/mark>/gi)].map((m) => m[1].trim());
    if (marks.length) return [...new Set(marks)].join(' ');
    return snip.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  };

  const handlePreview = async (doc: Document) => {
    const ext = getExt(doc.originalName);
    if (!PREVIEWABLE_EXTS.includes(ext)) {
      await appAlert({
        title: 'Preview unavailable',
        message: 'Preview not available for this file type. Use download instead.',
      });
      return;
    }
    const searchQuery = highlightQueryFor(doc.id);
    try {
      const { data } = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });

      if (ext === 'docx') {
        const arrayBuffer = await data.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setPreviewDoc({
          url: '',
          name: doc.originalName,
          type: 'docx',
          htmlContent: result.value,
          searchQuery,
        });
        return;
      }

      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
      };
      const blob = new Blob([data], { type: mimeMap[ext] || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      setPreviewDoc({
        url,
        name: doc.originalName,
        type: ext === 'pdf' ? 'pdf' : 'image',
        searchQuery,
      });
    } catch {
      await appAlert({ title: 'Preview failed', message: 'Failed to load preview.' });
    }
  };

  const closePreview = () => {
    if (previewDoc?.url) URL.revokeObjectURL(previewDoc.url);
    setPreviewDoc(null);
  };

  const handleRunOcr = async (doc: Document) => {
    setDriveToast(`Running OCR on ${doc.originalName}…`);
    try {
      await api.post(`/documents/${doc.id}/ocr`);
      setDriveToast(`OCR complete for ${doc.originalName}`);
      fetchDocs();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'OCR failed';
      setDriveToast(message);
    }
  };

  const handleVersionHistory = async (doc: Document) => {
    setVersionDoc(doc);
    try {
      const { data } = await api.get(`/documents?parentId=${doc.parentId || doc.id}`);
      const allVersions = [doc, ...(data as Document[]).filter((d: Document) => d.id !== doc.id)];
      allVersions.sort((a, b) => b.version - a.version);
      setVersions(allVersions);
    } catch {
      setVersions([doc]);
    }
  };

  return (
    <AppPageContainer>
      <PageHeader
        title="Documents"
        description={`${documents.length} files · ${formatSize(totalSize)} used`}
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setShowDrive(true)}>
              <CloudArrowUp size={16} /> Google Drive
            </Button>
            <Button type="button" size="sm" className="gap-2" onClick={() => setShowUpload(true)}>
              <Plus size={16} /> New Upload
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FOLDERS.map((folder) => {
          const isActive = activeFolder === folder;
          return (
            <button
              key={folder}
              type="button"
              onClick={() => setActiveFolder(isActive ? '' : folder)}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                isActive
                  ? 'bg-surface-muted border-border shadow-sm ring-1 ring-border'
                  : 'bg-card border-border hover:bg-hover-bg hover:border-border'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isActive ? 'bg-surface-muted' : 'bg-surface'
                }`}
              >
                {isActive ? (
                  <FolderOpen size={18} className="text-foreground" />
                ) : (
                  <Folder size={18} className="text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium truncate ${isActive ? 'text-foreground font-semibold' : 'text-foreground'}`}
                >
                  {folder}
                </p>
                <p className="text-xs text-muted-foreground">{folderCounts[folder] || 0} files</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button type="button" onClick={() => setActiveFolder('')} className="hover:text-primary transition-colors">
          My Drive
        </button>
        {activeFolder && (
          <>
            <ChevronRight size={14} />
            <span className="text-foreground font-medium">{activeFolder}</span>
          </>
        )}
      </div>

      <SearchStatusBanner />

      {driveToast && (
        <p className="text-sm text-foreground-secondary rounded-lg border border-border bg-surface-muted px-3 py-2">
          {driveToast}
          <button
            type="button"
            className="ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => setDriveToast(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </p>
      )}

      {canReindex && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReindex}
            disabled={reindexing}
            className="gap-1.5"
          >
            <ArrowsClockwise size={14} className={reindexing ? 'animate-spin' : ''} />
            {reindexing ? 'Queuing…' : 'Reindex search'}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value.trim()) fetchDocs();
            }}
            placeholder="Search files and content..."
            aria-label="Search files and content"
            className="input-field pl-9 !rounded-full"
          />
          {searchLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by document type" className="input-field w-auto !rounded-full text-sm">
          <option value="">All Types</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
          aria-label="Sort documents"
          className="input-field w-auto !rounded-full text-sm"
        >
          <option value="date">Recent</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
        </select>
        <div className="flex items-center border border-border rounded-full overflow-hidden ml-auto">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-surface-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="Grid view"
            aria-label="Grid view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-surface-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
            aria-label="List view"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {showDrive && (
        <GoogleDrivePanel
          status={driveStatus}
          canManage={canManageDrive}
          onClose={() => setShowDrive(false)}
          onRefresh={loadDriveStatus}
          onSynced={fetchDocs}
        />
      )}

      {loading || searchLoading ? (
        <LoadingCenter label="Loading documents…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No matching files' : activeFolder ? 'This folder is empty' : 'No documents yet'}
          description={search ? 'Try a different search term' : 'Upload your first document to get started'}
          action={
            !search ? (
              <Button type="button" size="sm" className="gap-2" onClick={() => setShowUpload(true)}>
                <Upload size={16} /> Upload Files
              </Button>
            ) : undefined
          }
          className="py-20"
        />
      ) : (
        <DocumentLibraryTable
          documents={filtered}
          viewMode={viewMode}
          highlights={highlights}
          onPreview={handlePreview}
          onDownload={handleDownload}
          onVersionHistory={handleVersionHistory}
          onToggleVisibility={handleToggleVisibility}
          onOcr={handleRunOcr}
          onDelete={handleDelete}
        />
      )}

      {showUpload && <DocumentUploadSection onClose={() => setShowUpload(false)} onUploaded={fetchDocs} />}

      {versionUpload && (
        <DocumentUploadSection
          onClose={() => setVersionUpload(null)}
          onUploaded={fetchDocs}
          versionOf={{
            id: versionUpload.parentId || versionUpload.id,
            originalName: versionUpload.originalName,
            engagementId: versionUpload.engagementId ?? null,
            version: versions[0]?.version ?? versionUpload.version,
          }}
        />
      )}

      {versionDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          {...modalBackdropProps(() => {
            setVersionDoc(null);
            setVersions([]);
          }, 'Close version history')}
        >
          <div className="card w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History size={18} className="text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Version History</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVersionDoc(null);
                  setVersions([]);
                }}
                className="p-1 rounded-lg hover:bg-hover-bg"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-3 truncate">{versionDoc.originalName}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full mb-4 gap-2"
              onClick={() => {
                const target = versionDoc;
                setVersionDoc(null);
                setVersionUpload(target);
              }}
            >
              <Upload size={14} /> Upload new version
            </Button>
            <div className="space-y-2">
              {versions.map((v, idx) => {
                const cfg = getFileConfig(v.originalName);
                const Icon = cfg.icon;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${idx === 0 ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon size={16} className={cfg.color} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          v{v.version} {idx === 0 && <span className="text-xs text-primary">(Current)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatSize(v.size)} · {timeAgo(v.createdAt)}
                        </p>
                        {v.uploadedBy && (
                          <p className="text-[10px] text-muted-foreground">
                            by {v.uploadedBy.firstName} {v.uploadedBy.lastName}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownload(v.id, v.originalName)}
                      className="p-1.5 rounded-lg hover:bg-hover-bg text-muted-foreground hover:text-primary"
                      title="Download this version"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                );
              })}
              {versions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No version history available</p>
              )}
            </div>
          </div>
        </div>
      )}

      <DocumentPreviewModal preview={previewDoc} onClose={closePreview} />
    </AppPageContainer>
  );
}
