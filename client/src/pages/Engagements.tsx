import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, MagnifyingGlass as Search, Funnel as Filter, Briefcase, Calendar, Users as UsersIcon,
  CaretRight as ChevronRight, DotsThreeVertical as MoreVertical, X, CheckCircle as CheckCircle2, XCircle, Clock,
  GitBranch, List, SquaresFour as LayoutGrid, Shield
} from '@phosphor-icons/react';
import api from '../services/api';
import type { Engagement, EngagementType, EngagementStatus, SignOff } from '../types';
import { useAuth } from '../context/AuthContext';
import PageHeader, { PageToolbar } from '../components/layout/PageHeader';
import PageLoading from '../components/layout/PageLoading';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { GradientAvatar } from '@/components/ui/gradient-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { modalBackdropProps } from '@/lib/interactiveProps';
import { PanelCard } from '@/components/layout/PanelCard';
import { EmptyState } from '@/components/layout/StatePanels';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { EngagementLifecycleBadge, ApprovalStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { formatApiError } from '@/lib/apiErrors';
import { appAlert } from '@/context/AppDialogContext';
import {
  SERVICE_CATALOG,
  WORKFLOW_DOMAIN_LABELS,
  type WorkflowDomain,
} from '@/lib/workflowCatalog';
import { ServiceRequirementsPanel } from '@/components/engagement/ServiceRequirementsPanel';

const TYPE_LABEL: Record<string, string> = {
  'Statutory': 'Statutory Audit',
  'Tax (44AB)': 'Tax Audit (44AB)',
  'Internal': 'Internal Audit',
  'GST': 'GST Audit',
  'Special': 'Special Audit',
};

const STATUS_ORDER = ['Planning', 'Fieldwork', 'Under Review', 'Reporting', 'Closed'];
const STATUS_PHASE_COLORS: Record<string, string> = {
  Planning: 'bg-blue-500',
  Fieldwork: 'bg-amber-500',
  'Under Review': 'bg-purple-500',
  Reporting: 'bg-cyan-500',
  Closed: 'bg-green-500',
};

const CREATE_DOMAIN_GROUPS: WorkflowDomain[] = ['AUDIT', 'DT', 'IDT'];

export default function Engagements() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') ?? '');
  const [filterType, setFilterType] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [selectedEng, setSelectedEng] = useState<string | null>(null);
  const [signoffs, setSignoffs] = useState<SignOff[]>([]);
  const [showSignoffModal, setShowSignoffModal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchEngagements = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterType) params.set('type', filterType);

    setLoadError(null);
    setLoading(true);
    api.get(`/engagements?${params.toString()}`)
      .then(({ data }) => setEngagements(data.engagements || []))
      .catch((e) => setLoadError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, [search, filterStatus, filterType]);

  useEffect(() => { fetchEngagements(); }, [fetchEngagements]);

  // Fetch sign-offs when an engagement is selected
  useEffect(() => {
    if (!selectedEng) { setSignoffs([]); return; }
    api.get(`/signoffs?engagementId=${selectedEng}`)
      .then(({ data }) => setSignoffs(data))
      .catch(console.error);
  }, [selectedEng]);

  const handleSignoff = async (type: 'Preparer' | 'Manager' | 'Partner') => {
    if (!selectedEng) return;
    try {
      await api.post('/signoffs', { type, engagementId: selectedEng });
      // re-fetch
      const { data } = await api.get(`/signoffs?engagementId=${selectedEng}`);
      setSignoffs(data);
    } catch (err) {
      void appAlert({ title: 'Sign-off failed', message: formatApiError(err) });
    }
  };

  const handleSignoffAction = async (id: string, status: 'Approved' | 'Rejected') => {
    try {
      await api.patch(`/signoffs/${id}`, { status });
      if (selectedEng) {
        const { data } = await api.get(`/signoffs?engagementId=${selectedEng}`);
        setSignoffs(data);
      }
    } catch (err) {
      void appAlert({ title: 'Update failed', message: formatApiError(err) });
    }
  };

  return (
    <AppPageContainer>
      <PageHeader
        title="Engagements"
        description={`${engagements.length} engagement${engagements.length === 1 ? '' : 's'} in your portfolio`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/services')}>
              Service catalog
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/engagements/portfolio')}>
              Portfolio view
            </Button>
            {['Partner', 'Admin', 'Manager'].includes(user?.role || '') && (
              <Button type="button" variant="outline" size="sm" onClick={() => navigate('/compliance-calendar')}>
                Compliance calendar
              </Button>
            )}
            {['Partner', 'Manager'].includes(user?.role || '') ? (
              <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
                <Plus size={16} className="mr-1" /> New engagement
              </Button>
            ) : null}
          </div>
        }
      />

      {loadError && (
        <ErrorBanner message={loadError} onRetry={fetchEngagements} className="mb-4" />
      )}

      <PageToolbar>
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search engagements..."
            aria-label="Search engagements"
            className="input-field pl-9"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status" className="input-field w-full sm:w-40">
          <option value="">All Status</option>
          <option value="Planning">Planning</option>
          <option value="Fieldwork">Fieldwork</option>
          <option value="Review">Review</option>
          <option value="Completed">Completed</option>
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Filter by type" className="input-field w-full sm:w-40">
          <option value="">All Types</option>
          <option value="Statutory">Statutory Audit</option>
          <option value="Tax (44AB)">Tax Audit (44AB)</option>
          <option value="Internal">Internal Audit</option>
          <option value="GST">GST</option>
          <option value="Special">Special</option>
        </select>
        <div className="segmented-control ml-auto">
          <button
            type="button"
            data-active={viewMode === 'list' ? 'true' : 'false'}
            onClick={() => setViewMode('list')}
            title="List view"
            aria-label="List view"
          >
            <List size={16} />
          </button>
          <button
            type="button"
            data-active={viewMode === 'timeline' ? 'true' : 'false'}
            onClick={() => setViewMode('timeline')}
            title="Timeline view"
            aria-label="Timeline view"
          >
            <GitBranch size={16} />
          </button>
        </div>
      </PageToolbar>

      {/* List / Timeline */}
      {loading ? (
        <PageLoading className="h-40" />
      ) : viewMode === 'timeline' ? (
        /* ── TIMELINE VIEW ── */
        <div className="space-y-3">
          {engagements.map((eng) => {
            const currentIdx = STATUS_ORDER.indexOf(eng.status);
            return (
              <PanelCard key={eng.id}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Briefcase size={16} className="text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{eng.title}</p>
                      <p className="text-xs text-muted-foreground">{eng.client?.name} · {TYPE_LABEL[eng.type] || eng.type} · FY {eng.financialYear}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedEng(selectedEng === eng.id ? null : eng.id)} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Shield size={12} /> Sign-offs
                  </button>
                </div>
                {/* Gantt-like progress bar */}
                <div className="flex items-center gap-1">
                  {STATUS_ORDER.map((phase, idx) => {
                    const isCompleted = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    return (
                      <div key={phase} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`w-full h-2 rounded-full ${
                          isCompleted ? STATUS_PHASE_COLORS[phase] : isCurrent ? STATUS_PHASE_COLORS[phase] + ' animate-pulse' : 'bg-border'
                        }`} />
                        <span className={`text-[10px] ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{phase}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Sign-off panel for selected engagement */}
                {selectedEng === eng.id && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Digital sign-offs</h4>
                    {signoffs.length === 0 ? (
                      <p className="mb-3 text-xs text-muted-foreground">No sign-offs yet for this engagement.</p>
                    ) : (
                      <div className="space-y-2 mb-3">
                        {signoffs.map((s) => (
                          <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-surface">
                            <div className="flex items-center gap-2">
                              {s.status === 'Approved' ? <CheckCircle2 size={14} className="text-success" /> :
                               s.status === 'Rejected' ? <XCircle size={14} className="text-danger" /> :
                               <Clock size={14} className="text-warning" />}
                              <div>
                                <span className="text-xs font-medium text-foreground">{s.type}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {s.user ? `${s.user.firstName} ${s.user.lastName}` : ''}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <ApprovalStatusBadge status={s.status} />
                              {s.status === 'Pending' && ['Partner', 'Manager'].includes(user?.role || '') && (
                                <div className="flex gap-1">
                                  <Button type="button" size="sm" variant="success" onClick={() => handleSignoffAction(s.id, 'Approved')}>Approve</Button>
                                  <Button type="button" size="sm" variant="destructive" onClick={() => handleSignoffAction(s.id, 'Rejected')}>Reject</Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {['Preparer', 'Manager', 'Partner'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleSignoff(type as 'Preparer' | 'Manager' | 'Partner')}
                          className="text-xs rounded-lg border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:bg-hover-bg hover:text-foreground"
                        >
                          Request {type} Sign-off
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </PanelCard>
            );
          })}
          {engagements.length === 0 && (
            <EmptyState title="No engagements found" />
          )}
        </div>
      ) : (
        <PanelCard title="Portfolio">
        <div className="divide-y divide-border -mx-4 -my-4 sm:-mx-4">
          {engagements.map((eng) => (
            <Link
              key={eng.id}
              to={`/engagements/${eng.id}?tab=workflow`}
              className="flex items-center justify-between gap-4 px-4 py-4 cursor-pointer transition-colors hover:bg-muted/30 group no-underline text-inherit"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="icon-well-md">
                  <Briefcase size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{eng.title}</p>
                    <EngagementLifecycleBadge status={eng.status} />
                    {eng.workflowDomain && (
                      <Badge variant="outline" className="text-[10px]">
                        {WORKFLOW_DOMAIN_LABELS[eng.workflowDomain]}
                      </Badge>
                    )}
                    {eng.currentStage && (
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {eng.currentStage}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
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
                      <span
                        key={m.id}
                        title={`${m.user?.firstName} ${m.user?.lastName}`}
                        className="inline-flex"
                      >
                        <GradientAvatar
                          seed={`${m.user?.firstName}-${m.user?.lastName}`}
                          initials={m.user?.initials}
                          size="sm"
                          className="ring-2 ring-card"
                        />
                      </span>
                    ))}
                    {eng.members.length > 3 && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-card-hover text-[10px] text-muted-foreground">
                        +{eng.members.length - 3}
                      </div>
                    )}
                  </div>
                )}

                {/* Counts */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {eng._count && (
                    <>
                      <span>{eng._count.workpapers} WP</span>
                      <span>{eng._count.documents} Docs</span>
                    </>
                  )}
                </div>

                <ChevronRight size={16} className="text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
            </Link>
          ))}

          {engagements.length === 0 && (
            <EmptyState
              title="No engagements found"
              description="Create your first engagement to get started"
            />
          )}
        </div>
        </PanelCard>
      )}

      {/* Create Modal */}
      {showCreate && <CreateEngagementModal onClose={() => setShowCreate(false)} onCreated={fetchEngagements} />}
    </AppPageContainer>
  );
}

// ─── Create Engagement Modal ───
function serviceToEngagementType(code: string): EngagementType {
  const svc = SERVICE_CATALOG.find((s) => s.code === code);
  if (!svc) return 'Special';
  if (svc.domain === 'IDT') return 'GST';
  if (svc.domain === 'AUDIT') {
    return code.includes('TAX_AUDIT') ? 'Tax (44AB)' : 'Statutory';
  }
  return 'Special';
}

function CreateEngagementModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '',
    clientId: '',
    serviceCode: 'STATUTORY_AUDIT',
    workflowDomain: 'AUDIT' as WorkflowDomain,
    type: 'Statutory' as EngagementType,
    financialYear: '2024-25',
    startDate: '',
    billingType: 'Fixed',
    billingAmount: '',
  });
  const [recurring, setRecurring] = useState({
    enabled: false,
    frequency: 'monthly' as 'monthly' | 'quarterly' | 'yearly',
    triggerDay: 1,
    triggerTime: '09:00',
    autoCreateStartDate: new Date().toISOString().slice(0, 10),
    autoCreateEndDate: '',
    autoSendDataRequestLetter: true,
  });
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  useEffect(() => {
    api.get('/clients').then(({ data }) => setClients(data.clients || [])).catch(() => {});
  }, []);

  const handleCreateClient = async () => {
    const name = newClientName.trim();
    if (!name) return;
    setCreatingClient(true);
    setError('');
    try {
      const { data } = await api.post('/clients', { name });
      const created = data.client ?? data;
      setClients((prev) => [{ id: created.id, name: created.name }, ...prev]);
      setForm((prev) => ({ ...prev, clientId: created.id }));
      setAddingClient(false);
      setNewClientName('');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to create client';
      setError(message);
    } finally {
      setCreatingClient(false);
    }
  };

  const onServiceChange = (serviceCode: string) => {
    const svc = SERVICE_CATALOG.find((s) => s.code === serviceCode);
    if (!svc) return;
    const monthlyRecurring = ['GST_MONTHLY_RETURNS', 'GSTR_1', 'GSTR_3B', 'TDS_REMITTANCE'].includes(serviceCode);
    if (monthlyRecurring) {
      setRecurring((prev) => ({ ...prev, enabled: true, frequency: 'monthly' }));
    }
    setForm((prev) => ({
      ...prev,
      serviceCode,
      workflowDomain: svc.domain as WorkflowDomain,
      type: serviceToEngagementType(serviceCode),
      title: prev.title.trim() ? prev.title : `${svc.name} — FY ${prev.financialYear}`,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/engagements', {
        ...form,
        billingAmount: form.billingAmount ? parseFloat(form.billingAmount) : undefined,
        isRecurring: recurring.enabled,
        recurringSchedule: recurring.enabled
          ? {
              frequency: recurring.frequency,
              triggerDay: recurring.triggerDay,
              triggerTime: recurring.triggerTime,
              autoCreateStartDate: recurring.autoCreateStartDate,
              autoCreateEndDate: recurring.autoCreateEndDate || null,
              autoSendDataRequestLetter: recurring.autoSendDataRequestLetter,
            }
          : undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" {...modalBackdropProps(onClose, 'Close create engagement dialog')}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">New Engagement</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-hover-bg"><X size={18} className="text-foreground-muted" /></button>
        </div>

        {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="eng-create-service" className="block text-sm font-medium text-foreground-muted mb-1.5">Service (MKD catalog)</label>
            <select
              id="eng-create-service"
              aria-label="Service (MKD catalog)"
              value={form.serviceCode}
              onChange={(e) => onServiceChange(e.target.value)}
              required
              className="input-field"
            >
              {CREATE_DOMAIN_GROUPS.map((domain) => (
                <optgroup key={domain} label={WORKFLOW_DOMAIN_LABELS[domain]}>
                  {SERVICE_CATALOG.filter((s) => s.domain === domain).map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}{s.dueRule ? ` — ${s.dueRule}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-foreground-muted mt-1">
              Practice area: {WORKFLOW_DOMAIN_LABELS[form.workflowDomain]}
            </p>
            <ServiceRequirementsPanel serviceCode={form.serviceCode} compact className="mt-3" />
          </div>
          <div>
            <label htmlFor="eng-create-title" className="block text-sm font-medium text-foreground-muted mb-1.5">Engagement Name</label>
            <input id="eng-create-title" aria-label="Engagement Name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="input-field" placeholder="Statutory Audit FY 2024-25" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="eng-create-client" className="block text-sm font-medium text-foreground-muted">Client</label>
              <button
                type="button"
                onClick={() => { setAddingClient((v) => !v); setNewClientName(''); }}
                className="text-xs text-primary hover:underline"
              >
                {addingClient ? 'Select existing' : '+ New client'}
              </button>
            </div>
            {addingClient ? (
              <div className="flex gap-2">
                <input
                  aria-label="New client name"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="input-field flex-1"
                  placeholder="New client name"
                />
                <Button type="button" size="sm" onClick={handleCreateClient} disabled={creatingClient || !newClientName.trim()}>
                  {creatingClient ? 'Adding…' : 'Add'}
                </Button>
              </div>
            ) : (
              <select id="eng-create-client" aria-label="Client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required className="input-field">
                <option value="">Select client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="eng-create-type" className="block text-sm font-medium text-foreground-muted mb-1.5">Engagement Type</label>
              <select
                id="eng-create-type"
                aria-label="Engagement Type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as EngagementType })}
                className="input-field"
              >
                <option value="Statutory">Statutory Audit</option>
                <option value="Tax (44AB)">Tax Audit (44AB)</option>
                <option value="Internal">Internal Audit</option>
                <option value="GST">GST Return</option>
                <option value="Special">Direct Tax / Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="eng-create-fy" className="block text-sm font-medium text-foreground-muted mb-1.5">Financial Year</label>
              <input
                id="eng-create-fy"
                aria-label="Financial Year"
                value={form.financialYear}
                onChange={(e) => setForm({ ...form, financialYear: e.target.value })}
                className="input-field"
                placeholder="2024-25"
              />
            </div>
          </div>
          <div>
            <label htmlFor="eng-create-start-date" className="block text-sm font-medium text-foreground-muted mb-1.5">Start Date</label>
            <input id="eng-create-start-date" type="date" aria-label="Start Date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required className="input-field" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="eng-create-billing-type" className="block text-sm font-medium text-foreground-muted mb-1.5">Billing Type</label>
              <select id="eng-create-billing-type" aria-label="Billing Type" value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })} className="input-field">
                <option value="Fixed">Fixed</option>
                <option value="Hourly">Hourly</option>
                <option value="Retainer">Retainer</option>
              </select>
            </div>
            <div>
              <label htmlFor="eng-create-billing-amount" className="block text-sm font-medium text-foreground-muted mb-1.5">Estimated Fees (₹)</label>
              <input id="eng-create-billing-amount" type="number" aria-label="Estimated Fees (₹)" value={form.billingAmount} onChange={(e) => setForm({ ...form, billingAmount: e.target.value })} className="input-field" placeholder="150000" />
            </div>
          </div>
          <div className="border border-border rounded-lg p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={recurring.enabled}
                onChange={(e) => setRecurring((r) => ({ ...r, enabled: e.target.checked }))}
              />
              This engagement has recurring tasks
            </label>
            {recurring.enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <label htmlFor="eng-recurring-frequency" className="block text-xs text-foreground-muted mb-1">Frequency</label>
                  <select
                    id="eng-recurring-frequency"
                    aria-label="Recurring task frequency"
                    value={recurring.frequency}
                    onChange={(e) => setRecurring((r) => ({ ...r, frequency: e.target.value as typeof r.frequency }))}
                    className="input-field"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="eng-recurring-trigger-day" className="block text-xs text-foreground-muted mb-1">Trigger day</label>
                  <input
                    id="eng-recurring-trigger-day"
                    type="number"
                    aria-label="Trigger day"
                    min={1}
                    max={31}
                    value={recurring.triggerDay}
                    onChange={(e) => setRecurring((r) => ({ ...r, triggerDay: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label htmlFor="eng-recurring-trigger-time" className="block text-xs text-foreground-muted mb-1">Trigger time</label>
                  <input
                    id="eng-recurring-trigger-time"
                    type="time"
                    aria-label="Trigger time"
                    value={recurring.triggerTime}
                    onChange={(e) => setRecurring((r) => ({ ...r, triggerTime: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label htmlFor="eng-recurring-start-date" className="block text-xs text-foreground-muted mb-1">Auto-create from</label>
                  <input
                    id="eng-recurring-start-date"
                    type="date"
                    aria-label="Auto-create from"
                    value={recurring.autoCreateStartDate}
                    onChange={(e) => setRecurring((r) => ({ ...r, autoCreateStartDate: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label htmlFor="eng-recurring-end-date" className="block text-xs text-foreground-muted mb-1">Auto-create until (optional)</label>
                  <input
                    id="eng-recurring-end-date"
                    type="date"
                    aria-label="Auto-create until (optional)"
                    value={recurring.autoCreateEndDate}
                    onChange={(e) => setRecurring((r) => ({ ...r, autoCreateEndDate: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={recurring.autoSendDataRequestLetter}
                    onChange={(e) => setRecurring((r) => ({ ...r, autoSendDataRequestLetter: e.target.checked }))}
                  />
                  Auto-send data request letter
                </label>
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" className="flex-1" disabled={saving}>
              {saving ? 'Creating...' : 'Create Engagement'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
