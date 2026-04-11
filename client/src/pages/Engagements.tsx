import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Filter, Briefcase, Calendar, Users as UsersIcon,
  ChevronRight, MoreVertical, X
} from 'lucide-react';
import api from '../services/api';
import type { Engagement, EngagementType, EngagementStatus } from '../types';
import { useAuth } from '../context/AuthContext';

const STATUS_BADGE: Record<string, string> = {
  Planning: 'badge-primary',
  Fieldwork: 'badge-warning',
  Review: 'badge-neutral',
  Completed: 'badge-success',
  Archived: 'badge-neutral',
};

const TYPE_LABEL: Record<string, string> = {
  'Statutory': 'Statutory Audit',
  'Tax (44AB)': 'Tax Audit (44AB)',
  'Internal': 'Internal Audit',
  'GST': 'GST Audit',
  'Special': 'Special Audit',
};

export default function Engagements() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const fetchEngagements = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterType) params.set('type', filterType);

    api.get(`/engagements?${params.toString()}`)
      .then(({ data }) => setEngagements(data.engagements || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEngagements(); }, [search, filterStatus, filterType]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Engagements</h1>
          <p className="text-sm text-foreground-muted">{engagements.length} engagements found</p>
        </div>
        {['Partner', 'Manager'].includes(user?.role || '') && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Engagement
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search engagements..."
            className="input-field pl-9"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-full sm:w-40">
          <option value="">All Status</option>
          <option value="Planning">Planning</option>
          <option value="Fieldwork">Fieldwork</option>
          <option value="Review">Review</option>
          <option value="Completed">Completed</option>
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field w-full sm:w-40">
          <option value="">All Types</option>
          <option value="Statutory">Statutory Audit</option>
          <option value="Tax (44AB)">Tax Audit (44AB)</option>
          <option value="Internal">Internal Audit</option>
          <option value="GST">GST</option>
          <option value="Special">Special</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {engagements.map((eng) => (
            <div
              key={eng.id}
              onClick={() => navigate(`/engagements/${eng.id}`)}
              className="card flex items-center justify-between cursor-pointer hover:border-primary/30 transition-colors group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Briefcase size={18} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{eng.title}</p>
                    <span className={STATUS_BADGE[eng.status] || 'badge-neutral'}>{eng.status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-foreground-muted">
                    <span>{eng.client?.name}</span>
                    <span>•</span>
                    <span>{TYPE_LABEL[eng.type] || eng.type}</span>
                    <span>•</span>
                    <span>FY {eng.financialYear}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Team members */}
                {eng.members && eng.members.length > 0 && (
                  <div className="flex -space-x-2">
                    {eng.members.slice(0, 3).map((m) => (
                      <div
                        key={m.id}
                        className="w-7 h-7 rounded-full bg-card-hover border-2 border-card flex items-center justify-center text-[10px] font-bold text-foreground-secondary"
                        title={`${m.user?.firstName} ${m.user?.lastName}`}
                      >
                        {m.user?.initials}
                      </div>
                    ))}
                    {eng.members.length > 3 && (
                      <div className="w-7 h-7 rounded-full bg-card-hover border-2 border-card flex items-center justify-center text-[10px] text-foreground-muted">
                        +{eng.members.length - 3}
                      </div>
                    )}
                  </div>
                )}

                {/* Counts */}
                <div className="flex items-center gap-3 text-xs text-foreground-muted">
                  {eng._count && (
                    <>
                      <span>{eng._count.workpapers} WP</span>
                      <span>{eng._count.documents} Docs</span>
                    </>
                  )}
                </div>

                <ChevronRight size={16} className="text-foreground-muted group-hover:text-primary transition-colors" />
              </div>
            </div>
          ))}

          {engagements.length === 0 && (
            <div className="text-center py-16">
              <Briefcase size={40} className="mx-auto text-foreground-muted mb-3" />
              <p className="text-foreground-muted font-medium">No engagements found</p>
              <p className="text-foreground-muted text-sm mt-1">Create your first engagement to get started</p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && <CreateEngagementModal onClose={() => setShowCreate(false)} onCreated={fetchEngagements} />}
    </div>
  );
}

// ─── Create Engagement Modal ───
function CreateEngagementModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', clientId: '', type: 'Statutory', financialYear: '2024-25',
    startDate: '', billingType: 'Fixed', billingAmount: '',
  });
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/clients').then(({ data }) => setClients(data.clients || [])).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/engagements', {
        ...form,
        billingAmount: form.billingAmount ? parseFloat(form.billingAmount) : undefined,
      });
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
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">New Engagement</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-hover-bg"><X size={18} className="text-foreground-muted" /></button>
        </div>

        {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Engagement Name</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="input-field" placeholder="Statutory Audit FY 2024-25" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Client</label>
            <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required className="input-field">
              <option value="">Select client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field">
                <option value="Statutory">Statutory Audit</option>
                <option value="Tax (44AB)">Tax Audit (44AB)</option>
                <option value="Internal">Internal Audit</option>
                <option value="GST">GST</option>
                <option value="Special">Special</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-1.5">Financial Year</label>
              <input value={form.financialYear} onChange={(e) => setForm({ ...form, financialYear: e.target.value })} className="input-field" placeholder="2024-25" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Start Date</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required className="input-field" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-1.5">Billing Type</label>
              <select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })} className="input-field">
                <option value="Fixed">Fixed</option>
                <option value="Hourly">Hourly</option>
                <option value="Retainer">Retainer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-1.5">Estimated Fees (₹)</label>
              <input type="number" value={form.billingAmount} onChange={(e) => setForm({ ...form, billingAmount: e.target.value })} className="input-field" placeholder="150000" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Engagement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
