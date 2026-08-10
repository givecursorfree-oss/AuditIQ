import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, MagnifyingGlass as Search, ChartBar as FileBarChart, ClipboardText as ClipboardList, Warning as AlertTriangle, X,
  CaretDown as ChevronDown, CaretRight as ChevronRight, CheckCircle as CheckCircle2, DownloadSimple as Download
} from '@phosphor-icons/react';
import api from '../services/api';
import type { Report, Observation } from '../types';
import { useAuth } from '../context/AuthContext';
import { appAlert } from '../context/AppDialogContext';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import { ApprovalStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { modalBackdropProps } from '@/lib/interactiveProps';

type ReportTab = 'reports' | 'form3cd' | 'observations';

function parseReportTab(value: string | null): ReportTab {
  if (value === 'form3cd' || value === 'observations') return value;
  return 'reports';
}

export default function Reports() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseReportTab(searchParams.get('tab'));
  const setTab = (next: ReportTab) => {
    setSearchParams(next === 'reports' ? {} : { tab: next }, { replace: true });
  };
  const [reports, setReports] = useState<Report[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [form3cd, setForm3cd] = useState<{ clauseNumber: string; title: string; response: string; isApplicable: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [engagements, setEngagements] = useState<{ id: string; title: string }[]>([]);
  const [selectedEngagement, setSelectedEngagement] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const toggleShareWithClient = async (reportId: string, currentlyShared: boolean) => {
    try {
      await api.patch(`/reports/${reportId}/share-with-client`, { shared: !currentlyShared });
      fetchReports();
    } catch {
      void appAlert({ title: 'Sharing failed', message: 'Failed to update client sharing.' });
    }
  };

  const downloadPDF = async (reportId: string, title: string) => {
    try {
      setDownloading(reportId);
      const response = await api.get(`/reports/${reportId}/pdf`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      void appAlert({ title: 'Download failed', message: 'Failed to download PDF.' });
    } finally {
      setDownloading(null);
    }
  };

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
    <AppPageContainer>
      <PageHeader
        title="Reports"
        description="Audit reports, Form 3CD & observations"
        actions={
          tab === 'reports' && ['Partner', 'Manager'].includes(user?.role || '') ? (
            <button type="button" onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> New Report
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-full sm:w-fit overflow-x-auto">
        <button type="button" onClick={() => setTab('reports')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'reports' ? 'bg-card-hover text-foreground' : 'text-muted-foreground hover:text-foreground-secondary'}`}>
          <FileBarChart size={14} className="inline mr-1.5" /> Reports
        </button>
        <button type="button" onClick={() => setTab('form3cd')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'form3cd' ? 'bg-card-hover text-foreground' : 'text-muted-foreground hover:text-foreground-secondary'}`}>
          <ClipboardList size={14} className="inline mr-1.5" /> Form 3CD
        </button>
        <button type="button" onClick={() => setTab('observations')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'observations' ? 'bg-card-hover text-foreground' : 'text-muted-foreground hover:text-foreground-secondary'}`}>
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
                      <div className="icon-well-md">
                        <FileBarChart size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{r.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{r.type}</span>
                          <span>•</span>
                          <span>{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {['Partner', 'Manager', 'Admin'].includes(user?.role || '') && (
                        <button
                          type="button"
                          onClick={() => toggleShareWithClient(r.id, Boolean((r as Report & { sharedWithClient?: boolean }).sharedWithClient))}
                          className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                            (r as Report & { sharedWithClient?: boolean }).sharedWithClient
                              ? 'border-success text-success bg-success/10'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                          title="Share draft with client portal"
                        >
                          {(r as Report & { sharedWithClient?: boolean }).sharedWithClient ? 'Shared' : 'Share with client'}
                        </button>
                      )}
                      {['Partner', 'Manager', 'Admin'].includes(user?.role || '') && (
                        <button
                          type="button"
                          onClick={() => downloadPDF(r.id, r.title)}
                          disabled={downloading === r.id}
                          className="p-1.5 rounded-md hover:bg-card-hover text-muted-foreground hover:text-primary transition-colors"
                          title="Download PDF"
                        >
                          {downloading === r.id ? (
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Download size={16} />
                          )}
                        </button>
                      )}
                      <ApprovalStatusBadge status={r.status} />
                    </div>
                  </div>
                </div>
              ))}
              {reports.length === 0 && (
                <div className="text-center py-16">
                  <FileBarChart size={40} className="mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground font-medium">No reports yet</p>
                </div>
              )}
            </div>
          )}

          {/* Form 3CD Tab */}
          {tab === 'form3cd' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">Clause summary by engagement — select an engagement below.</p>
              </div>
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
                  {form3cd.map((clause) => (
                    <div key={clause.clauseNumber} className="card flex items-start gap-3 py-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        clause.isApplicable ? (clause.response ? 'bg-success/20' : 'bg-warning/20') : 'bg-card-hover'
                      }`}>
                        {clause.isApplicable ? (
                          clause.response ? <CheckCircle2 size={12} className="text-success" /> : <span className="text-xs text-warning font-bold">!</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">
                          <span className="font-mono text-xs text-primary mr-2">Cl. {clause.clauseNumber}</span>
                          {clause.title}
                        </p>
                        {clause.response && (
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{clause.response}</p>
                        )}
                        <span className={`text-[10px] ${clause.isApplicable ? 'text-success' : 'text-muted-foreground'}`}>
                          {clause.isApplicable ? 'Applicable' : 'Not Applicable'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedEngagement ? (
                <p className="text-center text-muted-foreground py-8">No Form 3CD clauses found for this engagement</p>
              ) : (
                <p className="text-center text-muted-foreground py-8">Select an engagement to view Form 3CD</p>
              )}
            </div>
          )}

          {/* Observations Tab */}
          {tab === 'observations' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap pb-2">
                <p className="text-sm text-muted-foreground">Observations across engagements.</p>
              </div>
              {observations.map(o => (
                <div key={o.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-foreground">{o.title}</p>
                    <ApprovalStatusBadge status={o.severity} />
                  </div>
                  {o.condition && <p className="text-xs text-muted-foreground mb-2">{o.condition}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {o.effect && <div><span className="text-muted-foreground">Effect:</span> {o.effect}</div>}
                    {o.recommendation && <div><span className="text-muted-foreground">Recommendation:</span> {o.recommendation}</div>}
                    {o.managementResponse && <div><span className="text-muted-foreground">Mgmt Response:</span> {o.managementResponse}</div>}
                  </div>
                </div>
              ))}
              {observations.length === 0 && (
                <div className="text-center py-16">
                  <AlertTriangle size={40} className="mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground font-medium">No observations yet</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showCreate && <CreateReportModal onClose={() => setShowCreate(false)} onCreated={fetchReports} engagements={engagements} />}
    </AppPageContainer>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" {...modalBackdropProps(onClose, 'Close create report dialog')}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">New Report</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-hover-bg"><X size={18} className="text-muted-foreground" /></button>
        </div>
        {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="report-create-title" className="block text-sm font-medium text-muted-foreground mb-1.5">Title</label>
            <input id="report-create-title" aria-label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="input-field" placeholder="Statutory Audit Report" />
          </div>
          <div>
            <label htmlFor="report-create-engagement" className="block text-sm font-medium text-muted-foreground mb-1.5">Engagement</label>
            <select id="report-create-engagement" aria-label="Engagement" value={form.engagementId} onChange={(e) => setForm({ ...form, engagementId: e.target.value })} required className="input-field">
              <option value="">Select engagement</option>
              {engagements.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="report-create-type" className="block text-sm font-medium text-muted-foreground mb-1.5">Type</label>
            <select id="report-create-type" aria-label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field">
              <option value="Audit">Audit Report</option>
              <option value="Tax">Tax Report</option>
              <option value="CARO">CARO</option>
              <option value="Management">Management Letter</option>
            </select>
          </div>
          <div>
            <label htmlFor="report-create-content" className="block text-sm font-medium text-muted-foreground mb-1.5">Content</label>
            <textarea id="report-create-content" aria-label="Content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="input-field min-h-[100px] resize-y" placeholder="Report content..." />
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
