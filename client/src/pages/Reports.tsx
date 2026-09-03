import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, ChartBar as FileBarChart, ClipboardText as ClipboardList, Warning as AlertTriangle, X,
  CheckCircle as CheckCircle2, DownloadSimple as Download
} from '@phosphor-icons/react';
import api from '../services/api';
import type { Report, Observation } from '../types';
import { useAuth } from '../context/AuthContext';
import { appAlert } from '../context/AppDialogContext';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import PageLoading from '../components/layout/PageLoading';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { EmptyState } from '@/components/layout/EmptyState';
import { AccessibleTabList, AccessibleTabPanel } from '@/components/ui/accessible-tabs';
import { ApprovalStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { modalBackdropProps } from '@/lib/interactiveProps';
import { Button } from '@/components/ui/button';

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
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadError(null);
    api.get('/reports')
      .then(({ data }) => setReports(data))
      .catch((e) => {
        console.error(e);
        setLoadError('Failed to load reports.');
      })
      .finally(() => setLoading(false));
  };

  const fetchObservations = () => {
    setLoading(true);
    setLoadError(null);
    api.get('/reports/observations')
      .then(({ data }) => setObservations(data))
      .catch((e) => {
        console.error(e);
        setLoadError('Failed to load observations.');
      })
      .finally(() => setLoading(false));
  };

  const fetchForm3CD = (engId: string) => {
    if (!engId) return;
    setLoading(true);
    setLoadError(null);
    api.get(`/reports/form3cd/${engId}`)
      .then(({ data }) => setForm3cd(data))
      .catch((e) => {
        console.error(e);
        setLoadError('Failed to load Form 3CD.');
      })
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
            <Button type="button" size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New Report
            </Button>
          ) : undefined
        }
      />

      <AccessibleTabList
        idPrefix="reports"
        ariaLabel="Report views"
        tabs={[
          { key: 'reports' as const, label: 'Reports', icon: FileBarChart },
          { key: 'form3cd' as const, label: 'Form 3CD', icon: ClipboardList },
          { key: 'observations' as const, label: 'Observations', icon: AlertTriangle },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loadError && (
        <ErrorBanner
          message={loadError}
          onRetry={() => {
            if (tab === 'reports') fetchReports();
            else if (tab === 'observations') fetchObservations();
            else if (tab === 'form3cd' && selectedEngagement) fetchForm3CD(selectedEngagement);
          }}
          className="mt-3"
        />
      )}

      {loading ? (
        <PageLoading className="h-40" />
      ) : (
        <>
          <AccessibleTabPanel id="reports-panel-reports" labelledBy="reports-tab-reports" hidden={tab !== 'reports'} className="space-y-2 mt-4">
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
                        aria-label="Download PDF"
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
            {reports.length === 0 && <EmptyState title="No reports yet" />}
          </AccessibleTabPanel>

          <AccessibleTabPanel id="reports-panel-form3cd" labelledBy="reports-tab-form3cd" hidden={tab !== 'form3cd'} className="space-y-4 mt-4">
            <select
              value={selectedEngagement}
              onChange={(e) => setSelectedEngagement(e.target.value)}
              className="input-field w-full sm:w-64"
              aria-label="Engagement"
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
              <EmptyState title="No Form 3CD clauses for this engagement" />
            ) : (
              <EmptyState title="Select an engagement" />
            )}
          </AccessibleTabPanel>

          <AccessibleTabPanel id="reports-panel-observations" labelledBy="reports-tab-observations" hidden={tab !== 'observations'} className="space-y-2 mt-4">
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
            {observations.length === 0 && <EmptyState title="No observations yet" />}
          </AccessibleTabPanel>
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
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" className="flex-1" disabled={saving}>{saving ? 'Creating...' : 'Create Report'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
