import { useState, useEffect } from 'react';
import { UploadSimple as Upload, X, Globe } from '@phosphor-icons/react';
import api from '@/services/api';
import {
  CATEGORIES,
  FOLDERS,
  FILE_CONFIG,
  DEFAULT_FILE,
  formatSize,
  getExt,
} from '@/components/documents/documentHelpers';
import { modalBackdropProps } from '@/lib/interactiveProps';
import { Button } from '@/components/ui/button';

type DocumentUploadSectionProps = {
  onClose: () => void;
  onUploaded: () => void;
  versionOf?: { id: string; originalName: string; engagementId: string | null; version: number } | null;
};

export default function DocumentUploadSection({ onClose, onUploaded, versionOf }: DocumentUploadSectionProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState('Other');
  const [folder, setFolder] = useState('Current File');
  const [engagementId, setEngagementId] = useState(versionOf?.engagementId ?? '');
  const [makePublic, setMakePublic] = useState(false);
  const [engagements, setEngagements] = useState<{ id: string; title: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    api
      .get('/engagements')
      .then(({ data }) => {
        const list = (data.engagements || []).map((e: { id: string; title: string }) => ({
          id: e.id,
          title: e.title,
        }));
        setEngagements(list);
      })
      .catch(() => {});
  }, []);

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setFiles((prev) => [...prev, ...arr]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    setProgress(0);
    let completed = 0;
    const errors: string[] = [];

    const outcomes = await Promise.all(
      files.map(async (file) => {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('category', category);
          formData.append('folder', folder);
          if (engagementId) formData.append('engagementId', engagementId);
          if (makePublic) formData.append('visibility', 'FIRM');
          if (versionOf) formData.append('parentId', versionOf.id);
          await api.post('/documents/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          return { ok: true as const };
        } catch (err: unknown) {
          const message =
            (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            `Failed: ${file.name}`;
          return { ok: false as const, message };
        } finally {
          completed += 1;
          setProgress(Math.round((completed / files.length) * 100));
        }
      })
    );

    const succeeded = outcomes.filter((o) => o.ok).length;
    for (const outcome of outcomes) {
      if (!outcome.ok) errors.push(outcome.message);
    }

    setUploading(false);
    if (errors.length > 0) {
      setError(`${succeeded}/${files.length} uploaded. Errors: ${errors.join('; ')}`);
    } else {
      onUploaded();
      onClose();
    }
    if (succeeded > 0) onUploaded();
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" {...modalBackdropProps(onClose, 'Close upload dialog')}>
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">
            {versionOf ? 'Upload New Version' : 'Upload Documents'}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-hover-bg">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {versionOf && (
          <div className="mb-4 p-3 bg-primary/10 border border-primary/30 rounded-lg text-sm text-foreground">
            Revised upload of <span className="font-medium">{versionOf.originalName}</span> — will be saved as
            <span className="font-medium"> v{versionOf.version + 1}</span> with the current date &amp; time.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          <label
            htmlFor="file-input"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-border'
            }`}
          >
            <Upload size={32} className="mx-auto text-muted-foreground mb-2" />
            {files.length > 0 ? (
              <p className="text-sm text-foreground">
                {files.length} file{files.length > 1 ? 's' : ''} selected ({formatSize(totalSize)})
              </p>
            ) : (
              <p className="text-sm text-foreground">Upload</p>
            )}
            <input
              id="file-input"
              type="file"
              className="hidden"
              aria-label="Upload documents"
              multiple
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
              }}
              accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg,.gif"
            />
          </label>

          {files.length > 0 && (
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {files.map((f, idx) => {
                const cfg = FILE_CONFIG[getExt(f.name)] || DEFAULT_FILE;
                const Icon = cfg.icon;
                const fileKey = `${f.name}:${f.size}:${f.lastModified}`;
                return (
                  <div key={fileKey} className="flex items-center gap-2 p-2 rounded-lg bg-surface text-sm">
                    <Icon size={14} className={cfg.color} />
                    <span className="flex-1 truncate text-foreground">{f.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="p-0.5 rounded hover:bg-hover-bg text-muted-foreground hover:text-danger"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {uploading && (
            <div className="w-full bg-border rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div>
            <label htmlFor="doc-upload-folder" className="block text-sm font-medium text-muted-foreground mb-1.5">Folder</label>
            <select id="doc-upload-folder" value={folder} onChange={(e) => setFolder(e.target.value)} className="input-field">
              {FOLDERS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="doc-upload-category" className="block text-sm font-medium text-muted-foreground mb-1.5">Category</label>
            <select id="doc-upload-category" value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="doc-upload-engagement" className="block text-sm font-medium text-muted-foreground mb-1.5">Engagement</label>
            <select
              id="doc-upload-engagement"
              value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              className="input-field"
              required
            >
              <option value="">Select engagement</option>
              {engagements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={makePublic}
              onChange={(e) => setMakePublic(e.target.checked)}
              className="rounded border-border"
            />
            <Globe size={16} className="text-amber-600" />
            Visible to entire firm (public in Documents)
          </label>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="flex-1" disabled={files.length === 0 || uploading}>
              {uploading ? `Uploading ${progress}%...` : files.length > 1 ? `Upload ${files.length} Files` : 'Upload'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
