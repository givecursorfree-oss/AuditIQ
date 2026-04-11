import { useState, useEffect } from 'react';
import {
  Plus, Search, FileText, Upload, Folder, Download, Trash2, X, Filter,
  ChevronRight, File, Image, FileSpreadsheet, FileType
} from 'lucide-react';
import api from '../services/api';
import type { Document } from '../types';
import { useAuth } from '../context/AuthContext';

const FILE_ICONS: Record<string, React.ElementType> = {
  pdf: FileText,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  csv: FileSpreadsheet,
  png: Image,
  jpg: Image,
  jpeg: Image,
  default: File,
};

const CATEGORIES = ['Financial', 'Legal', 'Tax', 'Compliance', 'Correspondence', 'Workpaper', 'Other'];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function Documents() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const fetch = () => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    api.get(`/documents?${params.toString()}`)
      .then(({ data }) => setDocuments(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [category]);

  const filtered = documents.filter(d =>
    d.originalName.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    try {
      await api.delete(`/documents/${id}`);
      fetch();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Documents</h1>
          <p className="text-sm text-foreground-muted">{filtered.length} documents</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="btn-primary flex items-center gap-2">
          <Upload size={16} /> Upload Document
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents..." className="input-field pl-9" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field w-full sm:w-40">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const ext = doc.originalName.split('.').pop()?.toLowerCase() || 'default';
            const Icon = FILE_ICONS[ext] || FILE_ICONS.default;
            return (
              <div key={doc.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.originalName}</p>
                    <div className="flex items-center gap-2 text-xs text-foreground-muted mt-0.5">
                      {doc.category && <span className="badge-neutral">{doc.category}</span>}
                      <span>{formatSize(doc.size)}</span>
                      <span>•</span>
                      <span>v{doc.version}</span>
                      <span>•</span>
                      <span>{new Date(doc.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-hover-bg text-foreground-muted hover:text-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16">
              <FileText size={40} className="mx-auto text-foreground-muted mb-3" />
              <p className="text-foreground-muted font-medium">No documents found</p>
              <p className="text-foreground-muted text-sm mt-1">Upload your first document to get started</p>
            </div>
          )}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={fetch} />}
    </div>
  );
}

// ─── Upload Modal ───
function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('Other');
  const [engagementId, setEngagementId] = useState('');
  const [engagements, setEngagements] = useState<{ id: string; title: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    api.get('/engagements').then(({ data }) => {
      const list = (data.engagements || []).map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }));
      setEngagements(list);
    }).catch(() => {});
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      if (engagementId) formData.append('engagementId', engagementId);
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploaded();
      onClose();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Upload Document</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-hover-bg"><X size={18} className="text-foreground-muted" /></button>
        </div>

        {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}

        <form onSubmit={handleUpload} className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length > 0) setFile(e.dataTransfer.files[0]);
            }}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-border'
            }`}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <Upload size={32} className="mx-auto text-foreground-muted mb-2" />
            {file ? (
              <p className="text-sm text-foreground">{file.name} ({formatSize(file.size)})</p>
            ) : (
              <>
                <p className="text-sm text-foreground-muted">Drag & drop or click to browse</p>
                <p className="text-xs text-foreground-muted mt-1">PDF, XLSX, DOCX, CSV, images (max 50MB)</p>
              </>
            )}
            <input
              id="file-input"
              type="file"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
              accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg,.gif"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Engagement (optional)</label>
            <select value={engagementId} onChange={(e) => setEngagementId(e.target.value)} className="input-field">
              <option value="">No engagement</option>
              {engagements.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={!file || uploading} className="btn-primary flex-1 disabled:opacity-50">
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
