import { useState, useEffect } from 'react';
import {
  Plus, Search, FileBarChart, ClipboardList, AlertTriangle, X,
  ChevronDown, ChevronRight, CheckCircle2
} from 'lucide-react';
import api from '../services/api';
import type { Report, Observation } from '../types';
import { useAuth } from '../context/AuthContext';

export default function Reports() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'reports' | 'form3cd' | 'observations'>('reports');
  const [reports, setReports] = useState<Report[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [form3cd, setForm3cd] = useState<{ clauseNumber: string; title: string; response: string; isApplicable: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [engagements, setEngagements] = useState<{ id: string; title: string }[]>([]);
  const [selectedEngagement, setSelectedEngagement] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.get('/engagements').then(({ data }) => {
      const list = (data.engagements || []).map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }));
      setEngagements(list);
    }).catch(() => {});
  }, []);

  const fetchReports = () => {
    setLoading(true);
    api.get('/reports')
      .then(({ data }) => setReports(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchObservations = () => {
    setLoading(true);
    api.get('/reports/observations')
      .then(({ data }) => setObservations(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchForm3CD = (engId: string) => {
    if (!engId) return;
    setLoading(true);
    api.get(`/reports/form3cd/${engId}`)
      .then(({ data }) => setForm3cd(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (tab === 'reports') fetchReports();
    else if (tab === 'observations') fetchObservations();
    else if (tab === 'form3cd' && selectedEngagement) fetchForm3CD(selectedEngagement);
    else setLoading(false);
  }, [tab, selectedEngagement]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-foreground-muted">Audit reports, Form 3CD & observations</p>
        </div>
        {tab === 'reports' && ['Partner', 'Manager'].includes(user?.role || '') && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Report
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-full sm:w-fit overflow-x-auto">
        <button onClick={() => setTab('reports')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'reports' ? 'bg-card-hover text-foreground' : 'text-foreground-muted hover:text-foreground-secondary'}`}>
          <FileBarChart size={14} className="inline mr-1.5" /> Reports
        </button>
        <button onClick={() => setTab('form3cd')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'form3cd' ? 'bg-card-hover text-foreground' : 'text-foreground-muted hover:text-foreground-secondary'}`}>
          <ClipboardList size={14} className="inline mr-1.5" /> Form 3CD
        </button>
        <button onClick={() => setTab('observations')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'observations' ? 'bg-card-hover text-foreground' : 'text-foreground-muted hover:text-foreground-secondary'}`}>
          <AlertTriangle size={14} className="inline mr-1.5" /> Observations
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Reports Tab */}
          {tab === 'reports' && (
            <div className="space-y-2">
              {reports.map(r => (
                <div key={r.id} className="card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileBarChart size={18} className="text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{r.title}</p>
                        <div className="flex items-center gap-2 text-xs text-foreground-muted mt-0.5">
                          <span>{r.type}</span>
                          <span>•</span>
                          <span>{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                    <span className={r.status === 'Final' ? 'badge-success' : r.status === 'Draft' ? 'badge-neutral' : 'badge-warning'}>{r.status}</span>
                  </div>
                </div>
              ))}
              {reports.length === 0 && (
                <div className="text-center py-16">
                  <FileBarChart size={40} className="mx-auto text-foreground-muted mb-3" />
                  <p className="text-foreground-muted font-medium">No reports yet</p>
                </div>
              )}
            </div>
          )}

          {/* Form 3CD Tab */}
          {tab === 'form3cd' && (
            <div className="space-y-4">
              <select
                value={selectedEngagement}
                onChange={(e) => setSelectedEngagement(e.target.value)}
                className="input-field w-full sm:w-64"
              >
                <option value="">Select engagement</option>
                {engagements.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>

              {form3cd.length > 0 ? (
                <div className="space-y-1">
                  {form3cd.map((clause, i) => (
                    <div key={i} className="card flex items-start gap-3 py-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        clause.isApplicable ? (clause.response ? 'bg-success/20' : 'bg-warning/20') : 'bg-card-hover'
                      }`}>
                        {clause.isApplicable ? (
                          clause.response ? <CheckCircle2 size={12} className="text-success" /> : <span className="text-xs text-warning font-bold">!</span>
                        ) : (
                          <span className="text-xs text-foreground-muted">—</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">
                          <span className="font-mono text-xs text-primary mr-2">Cl. {clause.clauseNumber}</span>
                          {clause.title}
                        </p>
                        {clause.response && (
                          <p className="text-xs text-foreground-muted mt-1 whitespace-pre-wrap">{clause.response}</p>
                        )}
                        <span className={`text-[10px] ${clause.isApplicable ? 'text-success' : 'text-foreground-muted'}`}>
                          {clause.isApplicable ? 'Applicable' : 'Not Applicable'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedEngagement ? (
                <p className="text-center text-foreground-muted py-8">No Form 3CD clauses found for this engagement</p>
              ) : (
                <p className="text-center text-foreground-muted py-8">Select an engagement to view Form 3CD</p>
              )}
            </div>
          )}

          {/* Observations Tab */}
          {tab === 'observations' && (
            <div className="space-y-2">
              {observations.map(o => (
                <div key={o.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-foreground">{o.title}</p>
                    <span className={
                      o.severity === 'Critical' ? 'badge-danger' : o.severity === 'Moderate' ? 'badge-warning' : 'badge-neutral'
                    }>{o.severity}</span>
                  </div>
                  {o.condition && <p className="text-xs text-foreground-muted mb-2">{o.condition}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-foreground-muted">
                    {o.effect && <div><span className="text-foreground-muted">Effect:</span> {o.effect}</div>}
                    {o.recommendation && <div><span className="text-foreground-muted">Recommendation:</span> {o.recommendation}</div>}
                    {o.managementResponse && <div><span className="text-foreground-muted">Mgmt Response:</span> {o.managementResponse}</div>}
                  </div>
                </div>
              ))}
              {observations.length === 0 && (
                <div className="text-center py-16">
                  <AlertTriangle size={40} className="mx-auto text-foreground-muted mb-3" />
                  <p className="text-foreground-muted font-medium">No observations yet</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showCreate && <CreateReportModal onClose={() => setShowCreate(false)} onCreated={fetchReports} engagements={engagements} />}
    </div>
  );
}

// ─── Create Report Modal ───
function CreateReportModal({ onClose, onCreated, engagements }: {
  onClose: () => void;
  onCreated: () => void;
  engagements: { id: string; title: string }[];
}) {
  const [form, setForm] = useState({ title: '', engagementId: '', type: 'Audit', content: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/reports', form);
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">New Report</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-hover-bg"><X size={18} className="text-foreground-muted" /></button>
        </div>
        {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="input-field" placeholder="Statutory Audit Report" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Engagement</label>
            <select value={form.engagementId} onChange={(e) => setForm({ ...form, engagementId: e.target.value })} required className="input-field">
              <option value="">Select engagement</option>
              {engagements.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field">
              <option value="Audit">Audit Report</option>
              <option value="Tax">Tax Report</option>
              <option value="CARO">CARO</option>
              <option value="Management">Management Letter</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">Content</label>
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="input-field min-h-[100px] resize-y" placeholder="Report content..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Creating...' : 'Create Report'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
