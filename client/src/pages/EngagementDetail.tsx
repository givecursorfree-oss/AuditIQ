import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Buildings, FileText, Calendar,
  Sparkle, Receipt, ShareNetwork, ChatCircle, GitBranch,
} from '@phosphor-icons/react';
import api from '../services/api';
import { appAlert } from '../context/AppDialogContext';
import { appToast } from '../context/AppToastContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import ClientAuditQueriesPanel from '../components/engagement/ClientAuditQueriesPanel';
import EngagementDocumentsPanel from '../components/engagement/EngagementDocumentsPanel';
import EngagementWorkflowPanel from '../components/engagement/EngagementWorkflowPanel';
import { EngagementStatusStrip } from '../components/engagement/EngagementStatusStrip';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { PageBreadcrumbs } from '../components/layout/PageBreadcrumbs';
import { PanelCard } from '../components/layout/PanelCard';
import { GradientAvatar } from '@/components/ui/gradient-avatar';
import { Button } from '@/components/ui/button';
import { NavCountBadge } from '@/components/ui/nav-count-badge';
import { AccessibleTabList, AccessibleTabPanel } from '@/components/ui/accessible-tabs';
import EngagementTimeLog from '@/components/time/EngagementTimeLog';
import EngagementTasksTab from '../components/engagement/EngagementTasksTab';
import EngagementTeamMultiSelect from '../components/engagement/EngagementTeamMultiSelect';
import EngagementPortalButtons from '../components/engagement/EngagementPortalButtons';
import { isTeamAssignmentBlocked, LETTER_GATE_MESSAGE, engagementHasTeam } from '@/lib/letterGatePolicy';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { SERVICE_CATALOG } from '@/lib/workflowCatalog';
import { LetterStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import type { ChecklistPayload } from '../components/engagement/ClientSubmissionsPanel';

interface Engagement {
  id: string;
  title: string;
  type: string;
  status: string;
  currentStage: string;
  financialYear: string;
  startDate?: string | null;
  deadline?: string | null;
  scopeIncluded?: string | null;
  scopeExcluded?: string | null;
  billingAmount?: number | null;
  udin?: string | null;
  partnerInChargeId?: string | null;
  managerId?: string | null;
  articleAssistantId?: string | null;
  elGenerated?: boolean;
  elSignedAt?: string | null;
  letterStatus?: string;
  requestStatus?: string | null;
  serviceCode?: string | null;
  isRecurring?: boolean;
  recurringAutomationActive?: boolean | null;
  client: { id: string; name: string };
}

interface KycDoc {
  id: string;
  docType: string;
  status: string;
  receivedAt?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: { firstName: string; lastName: string } | null;
}

interface CommandCenter {
  engagement: {
    id: string;
    title: string;
    currentStage: string;
    deadline: string | null;
    udin: string | null;
    filedAt: string | null;
  };
  team: {
    partner: { firstName: string; lastName: string } | null;
    manager: { firstName: string; lastName: string } | null;
    staff: { firstName: string; lastName: string } | null;
  };
  metrics: {
    checklistPct: number;
    checklistTotal: number;
    checklistDone: number;
    openObservations: number;
    pendingClientDocs: number;
    openClientQueries: number;
    workpaperCount: number;
    deadlineRag: 'green' | 'amber' | 'red' | 'neutral';
  };
  observations: { id: string; title: string; severity: string }[];
  pendingRequests: { id: string; title: string; status: string }[];
  lastActivity: { toStage: string; createdAt: string } | null;
}


type EngagementTab = 'overview' | 'documents' | 'queries' | 'el' | 'timelog';

const ENGAGEMENT_TABS = new Set<string>([
  'overview', 'documents', 'queries', 'el', 'timelog',
  // legacy URL aliases
  'workflow', 'tasks', 'submissions', 'kyc', 'checklist', 'history',
]);

function normalizeTab(raw: string | null): EngagementTab {
  if (!raw) return 'documents';
  if (raw === 'workflow' || raw === 'tasks' || raw === 'history') return 'documents';
  if (raw === 'submissions' || raw === 'kyc' || raw === 'checklist') return 'documents';
  if (ENGAGEMENT_TABS.has(raw)) return raw as EngagementTab;
  return 'documents';
}

export default function EngagementDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const [eng, setEng] = useState<Engagement | null>(null);
  const [hub, setHub] = useState<CommandCenter | null>(null);
  const [kyc, setKyc] = useState<KycDoc[]>([]);
  const [submissions, setSubmissions] = useState<ChecklistPayload | null>(null);
  const [engagementDocuments, setEngagementDocuments] = useState<
    NonNullable<ChecklistPayload & { engagementDocuments?: ChecklistPayload['clientUploads'] }>['clientUploads']
  >([]);
  const [tab, setTab] = useState<EngagementTab>('documents');
  const workflowSectionRef = useRef<HTMLElement>(null);
  const tabsSectionRef = useRef<HTMLDivElement>(null);
  const pageTopRef = useRef<HTMLDivElement>(null);
  const [newChecklist, setNewChecklist] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [recurringToggling, setRecurringToggling] = useState(false);

  const serviceLabel = eng?.serviceCode
    ? SERVICE_CATALOG.find((s) => s.code === eng.serviceCode)?.name ?? eng.serviceCode
    : null;

  const isPartner = user && ['Partner', 'Admin'].includes(user.role);
  const isManagerOrAbove = user && ['Partner', 'Admin', 'Manager'].includes(user.role);
  const hasExistingTeam = eng ? engagementHasTeam(eng) : false;
  const letterGateBlocked = eng ? isTeamAssignmentBlocked(eng.letterStatus, hasExistingTeam) : false;
  const assignmentDisabled = !isManagerOrAbove || letterGateBlocked;
  const canRespondToClientQueries = can('engagements', 'edit');
  const highlightTaskId = searchParams.get('taskId');
  const openClientQueryCount = hub?.metrics.openClientQueries ?? 0;
  const pendingClientDocs = hub?.metrics.pendingClientDocs ?? 0;

  async function load() {
    if (!id) return;
    let r;
    try {
      r = await api.get<Engagement>(`/engagements/${id}`);
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { error?: string } } };
      setLoadError(
        ax.response?.status === 404
          ? 'Engagement not found or you do not have access to it.'
          : ax.response?.data?.error || 'Failed to load engagement. Please try again.'
      );
      return;
    }
    setLoadError(null);
    setEng(r.data);
    setDocumentsLoading(true);
    try {
      const [k, c, hubRes] = await Promise.all([
        api.get(`/kyc/${r.data.client.id}`).catch(() => ({ data: [] })),
        api.get(`/data-checklist/${id}`).catch(() => ({ data: { items: [], clientUploads: [], engagementDocuments: [], engagementRequest: null } })),
        api.get<CommandCenter>(`/engagements/${id}/command-center`).catch(() => ({ data: null })),
      ]);
      setHub(hubRes.data);
      setKyc(k.data);
      const checklistPayload = c.data as ChecklistPayload & { engagementDocuments?: ChecklistPayload['clientUploads'] };
      if (Array.isArray(checklistPayload)) {
        setSubmissions(null);
        setEngagementDocuments([]);
      } else {
        setSubmissions({
          engagementRequest: checklistPayload.engagementRequest ?? null,
          items: checklistPayload.items ?? [],
          clientUploads: checklistPayload.clientUploads ?? [],
        });
        setEngagementDocuments(checklistPayload.engagementDocuments ?? checklistPayload.clientUploads ?? []);
      }
    } finally {
      setDocumentsLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  const scrollToWorkflow = useCallback(() => {
    workflowSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const scrollToPageTop = useCallback(() => {
    pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  function selectTab(next: EngagementTab) {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'documents') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  }

  function selectTabAndScroll(next: EngagementTab) {
    selectTab(next);
    requestAnimationFrame(() => {
      tabsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  useEffect(() => {
    const raw = searchParams.get('tab');
    const normalized = normalizeTab(raw);
    setTab(normalized);
    if (raw === 'workflow' || raw === 'tasks' || raw === 'history' || searchParams.get('taskId')) {
      requestAnimationFrame(() => scrollToWorkflow());
    }
  }, [searchParams, scrollToWorkflow]);

  async function addChecklistItem() {
    if (!newChecklist.trim() || !eng) return;
    try {
      await api.post(`/data-checklist/${eng.id}`, { title: newChecklist });
      setNewChecklist('');
      await load();
    } catch (e: any) {
      void appAlert({ title: 'Checklist failed', message: e?.response?.data?.error || 'Failed to add checklist item' });
    }
  }

  async function setKycStatus(itemId: string, status: string) {
    try {
      await api.patch(`/kyc/item/${itemId}`, { status });
      await load();
    } catch (e: any) {
      void appAlert({ title: 'Update failed', message: e?.response?.data?.error || 'Failed to update status' });
    }
  }

  async function draftInvoiceFromEngagement() {
    if (!eng) return;
    try {
      await api.post(`/invoices/from-engagement/${eng.id}`);
      appToast({ message: 'Draft invoice created. Open Billing to review.', variant: 'success' });
      navigate('/billing');
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      void appAlert({ title: 'Invoice failed', message: ax.response?.data?.error || 'Could not create invoice' });
    }
  }

  async function toggleRecurringAutomation(nextActive: boolean) {
    if (!eng?.isRecurring) return;
    setRecurringToggling(true);
    try {
      const { data } = await api.patch<{ isActive: boolean }>(`/engagements/${eng.id}/recurring`, {
        isActive: nextActive,
      });
      setEng((prev) => (prev ? { ...prev, recurringAutomationActive: data.isActive } : prev));
      appToast({
        message: data.isActive ? 'Recurring automation resumed' : 'Recurring automation paused',
        variant: 'success',
      });
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      void appAlert({
        title: 'Automation update failed',
        message: ax.response?.data?.error || 'Could not update recurring schedule',
      });
    } finally {
      setRecurringToggling(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => { setLoadError(null); void load(); }}>
            Retry
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/engagements')}>
            Back to engagements
          </Button>
        </div>
      </div>
    );
  }

  if (!eng) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <AppPageContainer className="space-y-5">
      <div ref={pageTopRef} className="scroll-mt-20 space-y-5">
      <PageBreadcrumbs
        items={[
          { label: 'Engagements', to: '/engagements' },
          { label: eng.title },
        ]}
      />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Buildings size={14} aria-hidden /> {eng.client.name}
            </span>
            <EngagementPortalButtons clientId={eng.client.id} engagementType={eng.type} />
          </div>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {eng.title}
            {serviceLabel ? (
              <Badge variant="secondary" className="font-normal">
                {serviceLabel}
              </Badge>
            ) : null}
            {eng.isRecurring ? (
              <Badge variant="outline" className="font-normal">
                Recurring
              </Badge>
            ) : null}
            {eng.letterStatus ? <LetterStatusBadge status={eng.letterStatus} /> : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {eng.type} · FY {eng.financialYear} · Stage:{' '}
            <strong className="text-foreground">{eng.currentStage}</strong>
            {eng.udin ? (
              <>
                {' '}
                · UDIN: <code className="text-xs">{eng.udin}</code>
              </>
            ) : null}
          </p>
          {hub?.lastActivity ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Last moved to <span className="font-medium text-foreground">{hub.lastActivity.toStage}</span>{' '}
              {new Date(hub.lastActivity.createdAt).toLocaleString('en-IN')}
            </p>
          ) : null}
        </div>
        {eng.deadline ? (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Deadline</div>
            <div className="flex items-center justify-end gap-1 font-semibold">
              <Calendar size={14} aria-hidden />
              {new Date(eng.deadline).toLocaleDateString('en-IN')}
            </div>
          </div>
        ) : null}
        {isManagerOrAbove ? (
          <div className="flex flex-wrap justify-end gap-2">
            {eng.isRecurring && eng.recurringAutomationActive !== null ? (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                <label htmlFor="eng-recurring-toggle" className="text-xs font-medium text-muted-foreground">
                  Monthly automation
                </label>
                <Switch
                  id="eng-recurring-toggle"
                  checked={eng.recurringAutomationActive === true}
                  disabled={recurringToggling}
                  onCheckedChange={(checked) => void toggleRecurringAutomation(checked)}
                  aria-label="Toggle recurring engagement automation"
                />
              </div>
            ) : null}
            <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => void draftInvoiceFromEngagement()}>
              <Receipt size={16} aria-hidden /> Draft invoice
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
              <Link to="/reports">
                <ShareNetwork size={16} aria-hidden /> Reports
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      {hub ? (
        <EngagementStatusStrip
          metrics={{
            currentStage: hub.engagement.currentStage,
            deadline: hub.engagement.deadline,
            deadlineRag: hub.metrics.deadlineRag,
            checklistPct: hub.metrics.checklistPct,
            checklistDone: hub.metrics.checklistDone,
            checklistTotal: hub.metrics.checklistTotal,
            openObservations: hub.metrics.openObservations,
            pendingClientDocs: hub.metrics.pendingClientDocs,
            openClientQueries: hub.metrics.openClientQueries ?? 0,
            udin: hub.engagement.udin,
            filedAt: hub.engagement.filedAt,
          }}
          onStageClick={scrollToWorkflow}
          onDocumentsClick={() => selectTabAndScroll('documents')}
          onQueriesClick={() => selectTabAndScroll('queries')}
        />
      ) : null}

      {(hub?.team.partner || hub?.team.manager || hub?.team.staff) ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Team</span>
          {hub?.team.partner ? <TeamChip roleLabel="Partner" user={hub.team.partner} /> : null}
          {hub?.team.manager ? <TeamChip roleLabel="Manager" user={hub.team.manager} /> : null}
          {hub?.team.staff ? <TeamChip roleLabel="Staff" user={hub.team.staff} /> : null}
        </div>
      ) : null}

      <nav
        aria-label="Jump to section"
        className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/20 p-1"
      >
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={scrollToPageTop}>
          Overview
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={scrollToWorkflow}>
          <GitBranch size={14} aria-hidden /> Workflow
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === 'documents' ? 'secondary' : 'ghost'}
          className="h-8 gap-1"
          onClick={() => selectTabAndScroll('documents')}
        >
          <FileText size={14} aria-hidden /> Documents
          {pendingClientDocs > 0 ? (
            <NavCountBadge count={pendingClientDocs} className="!ml-0 h-4 min-w-4 text-[9px]" />
          ) : null}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === 'queries' ? 'secondary' : 'ghost'}
          className="h-8 gap-1"
          onClick={() => selectTabAndScroll('queries')}
        >
          <ChatCircle size={14} aria-hidden /> Queries
          {openClientQueryCount > 0 ? (
            <NavCountBadge count={openClientQueryCount} className="!ml-0 h-4 min-w-4 text-[9px]" />
          ) : null}
        </Button>
      </nav>

      <section
        id="engagement-workflow"
        ref={workflowSectionRef}
        aria-label="Workflow and tasks"
        className="scroll-mt-20 space-y-4 border-b border-border pb-6"
      >
        {id ? (
          <>
            <EngagementWorkflowPanel
              engagementId={id}
              dataRequestPercent={hub?.metrics.checklistPct}
              onStageChanged={() => void load()}
            />
            <EngagementTasksTab engagementId={id} highlightTaskId={highlightTaskId} />
          </>
        ) : null}
      </section>

      <div ref={tabsSectionRef} className="scroll-mt-20 space-y-4">
      <AccessibleTabList
        idPrefix="engagement"
        ariaLabel="Engagement sections"
        tabs={[
          { key: 'documents', label: 'Documents', icon: FileText, badge: pendingClientDocs },
          { key: 'queries', label: 'Client queries', icon: ChatCircle, badge: openClientQueryCount },
          { key: 'overview', label: 'Scope & team', icon: Sparkle },
          { key: 'el', label: 'Engagement Letter', icon: FileText },
          { key: 'timelog', label: 'Time log', icon: Receipt },
        ]}
        active={tab}
        onChange={selectTab}
        className="-mx-1 px-1"
      />

      <AccessibleTabPanel id="engagement-panel-documents" labelledBy="engagement-tab-documents" hidden={tab !== 'documents'}>
        <EngagementDocumentsPanel
          submissions={submissions}
          kyc={kyc}
          engagementId={id!}
          engagementDocuments={engagementDocuments}
          canManage={!!isManagerOrAbove}
          isPartner={!!isPartner}
          loading={documentsLoading}
          pendingRequestCount={pendingClientDocs}
          newChecklist={newChecklist}
          onNewChecklistChange={setNewChecklist}
          onAddChecklist={() => void addChecklistItem()}
          onSetKycStatus={(itemId, status) => void setKycStatus(itemId, status)}
          onReload={() => void load()}
        />
      </AccessibleTabPanel>

      <AccessibleTabPanel id="engagement-panel-queries" labelledBy="engagement-tab-queries" hidden={tab !== 'queries' || !id}>
        <ClientAuditQueriesPanel engagementId={id!} canRespond={canRespondToClientQueries} />
      </AccessibleTabPanel>

      <AccessibleTabPanel
        id="engagement-panel-overview"
        labelledBy="engagement-tab-overview"
        hidden={tab !== 'overview'}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
          {id && (
            <div className="md:col-span-2">
              <EngagementTeamMultiSelect
                engagementId={id}
                disabled={assignmentDisabled || !isManagerOrAbove}
                onSaved={() => void load()}
              />
              {letterGateBlocked && (
                <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded p-2 mt-3">
                  {LETTER_GATE_MESSAGE} before the first team assignment.
                  <Link to={`/engagements/${eng.id}/letter`} className="underline ml-1">Open letter workflow</Link>
                </p>
              )}
              {!isManagerOrAbove && (
                <p className="text-xs text-muted-foreground mt-2">Only Manager+ can change assignments.</p>
              )}
            </div>
          )}

          <PanelCard title="Scope">
            <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Included</div>
              <p className="text-sm">{eng.scopeIncluded || '—'}</p>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Excluded</div>
              <p className="text-sm">{eng.scopeExcluded || '—'}</p>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Fees</div>
              <p className="text-sm">{eng.billingAmount ? `₹${Number(eng.billingAmount).toLocaleString('en-IN')}` : '—'}</p>
            </div>
            </div>
          </PanelCard>
      </AccessibleTabPanel>

      <AccessibleTabPanel id="engagement-panel-el" labelledBy="engagement-tab-el" hidden={tab !== 'el' || !id}>
        <PanelCard title="Engagement letter">
          <p className="text-sm text-muted-foreground mb-4">
            Generate, send, and collect client signature before team assignment.
          </p>
          <Button type="button" size="sm" asChild>
            <Link to={`/engagements/${id}/letter`}>Open letter workflow</Link>
          </Button>
        </PanelCard>
      </AccessibleTabPanel>

      <AccessibleTabPanel id="engagement-panel-timelog" labelledBy="engagement-tab-timelog" hidden={tab !== 'timelog' || !id}>
        {id ? (
        <PanelCard title="Engagement time log">
          <p className="text-xs text-muted-foreground mb-3">
            {eng.title} · Client: {eng.client.name}
          </p>
          <EngagementTimeLog
            engagementId={id}
            engagementTitle={eng.title}
            clientName={eng.client.name}
            showHeader={false}
          />
        </PanelCard>
        ) : null}
      </AccessibleTabPanel>
      </div>
      </div>
    </AppPageContainer>
  );
}

function TeamChip({
  roleLabel,
  user,
}: {
  roleLabel: string;
  user: { firstName: string; lastName: string };
}) {
  const seed = `${user.firstName}-${user.lastName}`;
  const name = `${user.firstName} ${user.lastName}`.trim();
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 pl-1 pr-2.5 py-0.5">
      <GradientAvatar seed={seed} size="sm" />
      <span className="text-xs text-foreground">
        <span className="text-muted-foreground">{roleLabel}</span> {name}
      </span>
    </div>
  );
}
