import { useState, useEffect } from 'react';
import {
  Plus, Search, FileCheck, ChevronDown, ChevronRight, CheckCircle2,
  Clock, AlertCircle, X, MessageSquare, Send
} from 'lucide-react';
import api from '../services/api';
import type { Workpaper } from '../types';
import { useAuth } from '../context/AuthContext';

const STATUS_COLOR: Record<string, string> = {
  Draft: 'badge-neutral',
  Prepared: 'badge-primary',
  'Under Review': 'badge-warning',
  Reviewed: 'badge-primary',
  Approved: 'badge-success',
  'Needs Revision': 'badge-danger',
};

const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft',
  Prepared: 'Prepared',
  'Under Review': 'Under Review',
  Reviewed: 'Reviewed',
  Approved: 'Approved',
  'Needs Revision': 'Needs Revision',
};

export default function Workpapers() {
  const { user } = useAuth();
  const [workpapers, setWorkpapers] = useState<Workpaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetch = () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    api.get(`/workpapers?${params.toString()}`)
      .then(({ data }) => setWorkpapers(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [filterStatus]);

  const filtered = workpapers.filter(w =>
    w.title.toLowerCase().includes(search.toLowerCase()) ||
    w.reference.toLowerCase().includes(search.toLowerCase())
  );

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.patch(`/workpapers/${id}/status`, { status });
      fetch();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Workpapers</h1>
          <p className="text-sm text-foreground-muted">{filtered.length} workpapers</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Workpaper
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search workpapers..." className="input-field pl-9" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-full sm:w-48">
          <option value="">All Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((wp) => (
            <div key={wp.id} className="card">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === wp.id ? null : wp.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileCheck size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{wp.title}</p>
                      <span className={STATUS_COLOR[wp.status] || 'badge-neutral'}>{STATUS_LABEL[wp.status] || wp.status}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-foreground-muted mt-0.5">
                      <span>{wp.reference}</span>
                      <span>•</span>
                      <span>{wp.type}</span>
                      {wp.section && <><span>•</span><span>{wp.section}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {expandedId === wp.id ? <ChevronDown size={16} className="text-foreground-muted" /> : <ChevronRight size={16} className="text-foreground-muted" />}
                </div>
              </div>

              {expandedId === wp.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  {wp.conclusion && (
                    <p className="text-sm text-foreground-muted"><span className="text-foreground-muted font-medium">Conclusion:</span> {wp.conclusion}</p>
                  )}

                  {/* Audit Steps */}
                  {wp.auditSteps && wp.auditSteps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-foreground-muted uppercase mb-2">Audit Steps</p>
                      <div className="space-y-1">
                        {wp.auditSteps.map((step) => (
                          <div key={step.id} className="flex items-center gap-3 text-sm">
                            {step.isCompleted ? (
                              <CheckCircle2 size={14} className="text-success flex-shrink-0" />
                            ) : (
                              <AlertCircle size={14} className="text-foreground-muted flex-shrink-0" />
                            )}
                            <span className="text-foreground-muted flex-1">{step.description}</span>
                            <span className="text-xs text-foreground-muted">{step.isCompleted ? 'Done' : 'Pending'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    {wp.status === 'Draft' && (
                      <button onClick={() => handleStatusChange(wp.id, 'Prepared')} className="btn-primary text-xs py-1.5 px-3">Mark Prepared</button>
                    )}
                    {wp.status === 'Prepared' && (
                      <button onClick={() => handleStatusChange(wp.id, 'Under Review')} className="btn-primary text-xs py-1.5 px-3">Submit for Review</button>
                    )}
                    {wp.status === 'Under Review' && user?.role === 'Manager' && (
                      <>
                        <button onClick={() => handleStatusChange(wp.id, 'Reviewed')} className="btn-primary text-xs py-1.5 px-3">Approve</button>
                        <button onClick={() => handleStatusChange(wp.id, 'Needs Revision')} className="btn-danger text-xs py-1.5 px-3">Request Revision</button>
                      </>
                    )}
                    {wp.status === 'Reviewed' && user?.role === 'Partner' && (
                      <button onClick={() => handleStatusChange(wp.id, 'Approved')} className="btn-primary text-xs py-1.5 px-3">Final Approve</button>
                    )}
                    {wp.status === 'Needs Revision' && (
                      <button onClick={() => handleStatusChange(wp.id, 'Prepared')} className="btn-secondary text-xs py-1.5 px-3">Resume Work</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <FileCheck size={40} className="mx-auto text-foreground-muted mb-3" />
              <p className="text-foreground-muted font-medium">No workpapers found</p>
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateWorkpaperModal onClose={() => setShowCreate(false)} onCreated={fetch} />}
    </div>
  );
}

// ─── Create Workpaper Modal ───
function CreateWorkpaperModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', engagementId: '', type: 'Standard', reference: '', section: '',
  });
  const [engagements, setEngagements] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/engagements').then(({ data }) => {
      const list = (data.engagements || []).map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }));
      setEngagements(list);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/workpapers', form);
      onCreated();
      onClose();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">New Workpaper</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-hover-bg"><X size={18} className="text-foreground-muted" /></button>
        </div>
        {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="input-field" placeholder="Cash & Bank Balance Working" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Engagement</label>
            <select value={form.engagementId} onChange={(e) => setForm({ ...form, engagementId: e.target.value })} required className="input-field">
              <option value="">Select engagement</option>
              {engagements.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field">
                <option value="Standard">Standard</option>
                <option value="CARO">CARO</option>
                <option value="SA">SA</option>
                <option value="GST">GST</option>
                <option value="TDS">TDS</option>
                <option value="Lead Schedule">Lead Schedule</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-1.5">Section</label>
              <input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} required className="input-field" placeholder="Assets" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Reference</label>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required className="input-field" placeholder="WP-001" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Workpaper'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
