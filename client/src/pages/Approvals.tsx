import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckSquare,
  Clock,
  Plus,
  CaretRight as ChevronRight,
  CaretDown as ChevronDown,
  Check,
  XCircle,
  Trash as Trash2,
  PaperPlaneTilt as Send,
  ListChecks,
  Gear as Settings,
} from '@phosphor-icons/react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { appAlert } from '../context/AppDialogContext';
import { cn } from '@/lib/utils';
import PageHeader from '../components/layout/PageHeader';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { SplitPaneLayout } from '../components/layout/SplitPaneLayout';
import { PanelCard } from '../components/layout/PanelCard';
import { EmptyState, ErrorBanner, LoadingCenter } from '../components/layout/StatePanels';
import { WorkflowApprovalStatusBadge, PriorityBadge } from '@/components/mkd/WorkflowStatusBadge';
import { Button } from '@/components/ui/button';
import { NavCountBadge } from '@/components/ui/nav-count-badge';
import { AccessibleTabList, AccessibleTabPanel } from '@/components/ui/accessible-tabs';
import { ClaimsApprovalInbox } from '@/components/claims/ClaimsApprovalInbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface WorkflowStep {
  id: string;
  stepOrder: number;
  approverRole: string | null;
  approverUserId: string | null;
}

interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  entityType: string;
  steps: WorkflowStep[];
  isActive: boolean;
  createdAt: string;
}

interface ApprovalStep {
  id: string;
  stepOrder: number;
  status: string;
  approverId?: string | null;
  approver?: { firstName: string; lastName: string; email?: string };
  actionAt?: string | null;
  comments?: string | null;
}

interface ApprovalRequest {
  id: string;
  title: string;
  description?: string | null;
  entityType: string;
  priority: string;
  status: string;
  currentStep: number;
  createdAt: string;
  requesterId: string;
  requester: { firstName: string; lastName: string; email?: string };
  workflow?: { name: string; entityType: string; steps: WorkflowStep[] };
  steps: ApprovalStep[];
}

type View = 'pending' | 'submitted' | 'completed' | 'workflows';

const APPROVAL_VIEWS = new Set<View>(['pending', 'submitted', 'completed', 'workflows']);

function parseApprovalView(raw: string | null): View {
  if (raw && APPROVAL_VIEWS.has(raw as View)) return raw as View;
  return 'pending';
}

const ENTITY_TYPES = ['leave', 'document', 'expense', 'workpaper', 'engagement'] as const;
const APPROVER_ROLES = ['Staff', 'Manager', 'Admin', 'Partner'] as const;
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

function requesterName(r: ApprovalRequest): string {
  return `${r.requester.firstName} ${r.requester.lastName}`.trim();
}

function stepApproverLabel(stepOrder: number, workflowSteps: WorkflowStep[] = []): string {
  const ws = workflowSteps.find((s) => s.stepOrder === stepOrder);
  if (ws?.approverRole) return ws.approverRole;
  return 'Approver';
}

function canUserActOnRequest(
  req: ApprovalRequest,
  userId: string,
  userRole: string,
  isPrivileged: boolean
): boolean {
  if (req.status !== 'In Progress') return false;
  if (isPrivileged) return true;
  const current = req.steps.find((s) => s.stepOrder === req.currentStep && s.status === 'Pending');
  if (!current) return false;
  const ws = req.workflow?.steps?.find((s) => s.stepOrder === req.currentStep);
  const designatedUserId = current.approverId ?? ws?.approverUserId;
  const designatedRole = ws?.approverRole;
  if (designatedUserId) return designatedUserId === userId;
  if (designatedRole) return designatedRole === userRole;
  return false;
}

export default function Approvals() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [view, setView] = useState<View>(() => parseApprovalView(searchParams.get('view')));
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedReq, setSelectedReq] = useState<ApprovalRequest | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateReq, setShowCreateReq] = useState(false);
  const [showCreateWf, setShowCreateWf] = useState(false);

  const isAdmin = user?.role === 'Partner' || user?.role === 'Admin';

  useEffect(() => {
    const next = parseApprovalView(searchParams.get('view'));
    setView((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  useEffect(() => {
    void fetchData();
  }, [view]);

  async function fetchWorkflows() {
    try {
      const { data } = await api.get<Workflow[]>('/approvals/workflows');
      setWorkflows(data);
    } catch {
      setLoadError('Failed to load.');
    }
  }

  async function fetchData() {
    setLoading(true);
    setLoadError(null);
    try {
      if (view === 'workflows') {
        await fetchWorkflows();
      } else {
        const { data } = await api.get<ApprovalRequest[]>('/approvals/requests');
        setRequests(data);
        await fetchWorkflows();
      }
      const { data: count } = await api.get<{ count: number }>('/approvals/pending-count');
      setPendingCount(count.count);
    } catch {
      setLoadError('Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  const filteredRequests = useMemo(() => {
    const uid = user?.id;
    const role = user?.role || '';
    if (view === 'pending') {
      return requests.filter(
        (r) =>
          r.status === 'In Progress' &&
          (isAdmin || canUserActOnRequest(r, uid || '', role, false))
      );
    }
    if (view === 'submitted') {
      return requests.filter((r) => r.requesterId === uid);
    }
    if (view === 'completed') {
      return requests.filter((r) => r.status === 'Approved' || r.status === 'Rejected');
    }
    return requests;
  }, [requests, view, user?.id, user?.role, isAdmin]);

  async function handleAction(requestId: string, action: 'APPROVE' | 'REJECT', comments?: string) {
    try {
      await api.post(`/approvals/requests/${requestId}/action`, { action, comments });
      await fetchData();
      if (selectedReq?.id === requestId) {
        const { data } = await api.get<ApprovalRequest>(`/approvals/requests/${requestId}`);
        setSelectedReq(data);
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      void appAlert({
        title: 'Action failed',
        message: ax.response?.data?.error || `Failed to ${action.toLowerCase()} the request`,
      });
    }
  }

  const viewTabs = useMemo(
    () =>
      [
        { key: 'pending' as const, icon: Clock, label: 'Pending', badge: pendingCount },
        { key: 'submitted' as const, icon: Send, label: 'My Requests' },
        { key: 'completed' as const, icon: Check, label: 'Completed' },
        ...(isAdmin ? [{ key: 'workflows' as const, icon: Settings, label: 'Workflows' }] : []),
      ],
    [isAdmin, pendingCount]
  );

  const emptyText =
    view === 'pending'
      ? 'No pending approvals'
      : view === 'submitted'
        ? 'No submitted requests'
        : 'No completed requests';

  return (
    <AppPageContainer className="flex min-h-[min(100dvh-6rem,900px)] flex-col">
      <PageHeader
        title="Approvals"
        description="Manage approval workflows and requests"
        actions={
          <>
            {['Partner', 'Admin', 'Manager', 'Accounts'].includes(user?.role || '') && (
              <Button type="button" variant="outline" size="sm" onClick={() => navigate('/claims/batches')}>
                Claim batches
              </Button>
            )}
            {isAdmin && view === 'workflows' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowCreateWf(true)}
              >
                <Plus size={14} /> New Workflow
              </Button>
            )}
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setShowCreateReq(true)}>
              <Plus size={14} /> New Request
            </Button>
          </>
        }
      />

      <AccessibleTabList
        idPrefix="approvals"
        ariaLabel="Approval views"
        tabs={viewTabs}
        active={view}
        onChange={(key) => {
          setView(key);
          setSelectedReq(null);
          const params = new URLSearchParams(searchParams);
          if (key === 'pending') params.delete('view');
          else params.set('view', key);
          setSearchParams(params, { replace: true });
        }}
      />

      <AccessibleTabPanel
        id="approvals-panel-main"
        labelledBy={`approvals-tab-${view}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {loadError && <ErrorBanner message={loadError} onRetry={() => void fetchData()} className="mb-2" />}
        {loading ? (
          <LoadingCenter label="Loading approvals…" />
        ) : view === 'workflows' ? (
          <WorkflowList
            workflows={workflows}
            onDelete={async (id) => {
              try {
                await api.delete(`/approvals/workflows/${id}`);
                await fetchData();
              } catch (e: unknown) {
                const ax = e as { response?: { data?: { error?: string } } };
                void appAlert({
                  title: 'Delete failed',
                  message: ax.response?.data?.error || 'Failed to delete workflow',
                });
              }
            }}
          />
        ) : view === 'pending' && ['Partner', 'Admin', 'Manager'].includes(user?.role ?? '') ? (
          <div className="space-y-4">
            <PanelCard title="Staff claims">
              <ClaimsApprovalInbox />
            </PanelCard>
            <SplitPaneLayout
            hasSelection={Boolean(selectedReq)}
            onClearSelection={() => setSelectedReq(null)}
            backLabel="Back to requests"
            list={
              <RequestList
                requests={filteredRequests}
                onSelect={async (req) => {
                  try {
                    const { data } = await api.get<ApprovalRequest>(`/approvals/requests/${req.id}`);
                    setSelectedReq(data);
                  } catch {
                    void appAlert({ title: 'Load failed', message: 'Failed to load request details' });
                  }
                }}
                emptyText={emptyText}
              />
            }
            detail={
              selectedReq ? (
                <RequestDetail
                  req={selectedReq}
                  onAction={handleAction}
                  currentUserId={user?.id}
                  currentUserRole={user?.role}
                  isPrivileged={isAdmin}
                />
              ) : (
                <div className="hidden flex-col items-center justify-center p-8 text-muted-foreground lg:flex lg:min-h-[320px]">
                  <ListChecks size={48} className="mb-4 opacity-30" />
                  <p className="text-sm">Select a request to view details</p>
                </div>
              )
            }
          />
          </div>
        ) : (
          <SplitPaneLayout
            hasSelection={Boolean(selectedReq)}
            onClearSelection={() => setSelectedReq(null)}
            backLabel="Back to requests"
            list={
              <RequestList
                requests={filteredRequests}
                onSelect={async (req) => {
                  try {
                    const { data } = await api.get<ApprovalRequest>(`/approvals/requests/${req.id}`);
                    setSelectedReq(data);
                  } catch {
                    void appAlert({ title: 'Load failed', message: 'Failed to load request details' });
                  }
                }}
                emptyText={emptyText}
              />
            }
            detail={
              selectedReq ? (
                <RequestDetail
                  req={selectedReq}
                  onAction={handleAction}
                  currentUserId={user?.id}
                  currentUserRole={user?.role}
                  isPrivileged={isAdmin}
                />
              ) : (
                <div className="hidden flex-col items-center justify-center p-8 text-muted-foreground lg:flex lg:min-h-[320px]">
                  <ListChecks size={48} className="mb-4 opacity-30" />
                  <p className="text-sm">Select a request to view details</p>
                </div>
              )
            }
          />
        )}
      </AccessibleTabPanel>

      <CreateRequestDialog
        open={showCreateReq}
        workflows={workflows}
        onOpenChange={setShowCreateReq}
        onCreated={fetchData}
      />
      <CreateWorkflowDialog open={showCreateWf} onOpenChange={setShowCreateWf} onCreated={fetchData} />
    </AppPageContainer>
  );
}

function RequestList({
  requests,
  onSelect,
  emptyText,
}: {
  requests: ApprovalRequest[];
  onSelect: (r: ApprovalRequest) => void;
  emptyText: string;
}) {
  if (!requests.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <ListChecks size={40} className="mb-3 opacity-30 text-muted-foreground" />
        <EmptyState title={emptyText} />
      </div>
    );
  }
  return (
    <div className="space-y-1 p-2">
      {requests.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onSelect(r)}
          className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/30"
        >
          <CheckSquare size={18} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
              <PriorityBadge priority={r.priority} className="text-[10px]" />
              <WorkflowApprovalStatusBadge status={r.status} className="text-[10px]" />
            </div>
            <p className="text-xs text-muted-foreground">
              {r.workflow?.name || r.entityType} · by {requesterName(r)} ·{' '}
              {new Date(r.createdAt).toLocaleDateString()}
            </p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function RequestDetail({
  req,
  onAction,
  currentUserId,
  currentUserRole,
  isPrivileged,
}: {
  req: ApprovalRequest;
  onAction: (id: string, action: 'APPROVE' | 'REJECT', comments?: string) => void;
  currentUserId?: string;
  currentUserRole?: string;
  isPrivileged: boolean;
}) {
  const [comment, setComment] = useState('');
  const workflowSteps = req.workflow?.steps ?? [];
  const canAct = canUserActOnRequest(req, currentUserId || '', currentUserRole || '', isPrivileged);

  return (
    <div className="p-4 sm:p-6">
      <PanelCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{req.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{req.description || 'No description'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PriorityBadge priority={req.priority} />
            <WorkflowApprovalStatusBadge status={req.status} />
          </div>
        </div>

        <div className="form-grid-3 mb-6 text-sm">
          <div>
            <span className="text-muted-foreground">Type:</span>{' '}
            <span className="ml-1 font-medium">{req.entityType}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Requested by:</span>{' '}
            <span className="ml-1 font-medium">{requesterName(req)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Workflow:</span>{' '}
            <span className="ml-1 font-medium">{req.workflow?.name || '—'}</span>
          </div>
        </div>

        <h3 className="mb-3 text-sm font-semibold text-foreground">Approval Steps</h3>
        <div className="mb-6 space-y-3">
          {req.steps.map((s, i) => (
            <div key={s.id} className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  s.status === 'Approved' && 'bg-success text-white',
                  s.status === 'Rejected' && 'bg-destructive text-white',
                  s.status === 'Pending' &&
                    s.stepOrder === req.currentStep &&
                    'animate-pulse bg-warning text-white',
                  s.status === 'Pending' &&
                    s.stepOrder !== req.currentStep &&
                    'bg-muted text-muted-foreground',
                  s.status !== 'Pending' &&
                    s.status !== 'Approved' &&
                    s.status !== 'Rejected' &&
                    'bg-muted text-muted-foreground'
                )}
              >
                {s.status === 'Approved' ? <Check size={14} /> : s.status === 'Rejected' ? (
                  <XCircle size={14} />
                ) : (
                  i + 1
                )}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    Step {s.stepOrder}: {stepApproverLabel(s.stepOrder, workflowSteps)}
                  </p>
                  <WorkflowApprovalStatusBadge status={s.status} className="text-[10px]" />
                  {s.approver && (
                    <span className="text-xs text-muted-foreground">
                      ({s.approver.firstName} {s.approver.lastName})
                    </span>
                  )}
                </div>
                {s.actionAt && (
                  <p className="text-xs text-muted-foreground">{new Date(s.actionAt).toLocaleString()}</p>
                )}
                {s.comments && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">&ldquo;{s.comments}&rdquo;</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {canAct && req.status === 'In Progress' && (
          <div className="space-y-3 border-t border-border pt-4">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (optional)..."
              aria-label="Approval comment"
              className="input h-20 resize-none text-sm"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="success"
                className="gap-1.5"
                onClick={() => {
                  onAction(req.id, 'APPROVE', comment);
                  setComment('');
                }}
              >
                <Check size={14} /> Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => {
                  onAction(req.id, 'REJECT', comment);
                  setComment('');
                }}
              >
                <XCircle size={14} /> Reject
              </Button>
            </div>
          </div>
        )}
      </PanelCard>
    </div>
  );
}

function WorkflowList({
  workflows,
  onDelete,
}: {
  workflows: Workflow[];
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!workflows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Settings size={40} className="mb-3 opacity-30 text-muted-foreground" />
        <EmptyState title="No workflows configured" />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {workflows.map((w) => (
        <div key={w.id} className="rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-2 p-2">
            <button
              type="button"
              onClick={() => setExpanded(expanded === w.id ? null : w.id)}
              className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
              aria-expanded={expanded === w.id}
            >
              {expanded === w.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{w.name}</p>
                <p className="text-xs text-muted-foreground">
                  {w.entityType} · {w.steps.length} steps
                </p>
              </div>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Delete workflow ${w.name}`}
              onClick={() => onDelete(w.id)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
          {expanded === w.id && (
            <div className="border-t border-border px-4 pb-4 pt-0">
              {w.description && <p className="mb-2 text-xs text-muted-foreground">{w.description}</p>}
              <div className="space-y-1">
                {w.steps.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded bg-hover-bg p-1.5 text-xs text-foreground"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                      {s.stepOrder}
                    </span>
                    Approver: <span className="font-medium">{s.approverRole || 'Specific user'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CreateRequestDialog({
  open,
  workflows,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  workflows: Workflow[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    workflowId: '',
    priority: 'Normal' as (typeof PRIORITIES)[number],
  });
  const [saving, setSaving] = useState(false);

  const selectedWorkflow = workflows.find((w) => w.id === form.workflowId);

  async function submit() {
    if (!form.title || !form.workflowId || !selectedWorkflow) return;
    setSaving(true);
    try {
      await api.post('/approvals/requests', {
        title: form.title,
        description: form.description || undefined,
        workflowId: form.workflowId,
        entityType: selectedWorkflow.entityType,
        entityId: crypto.randomUUID(),
        priority: form.priority,
      });
      onCreated();
      onOpenChange(false);
      setForm({ title: '', description: '', workflowId: '', priority: 'Normal' });
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      void appAlert({
        title: 'Submit failed',
        message: ax.response?.data?.error || 'Failed to create approval request',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Approval Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="req-title" className="mb-1 block text-xs font-medium text-muted-foreground">
              Title *
            </label>
            <input
              id="req-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input text-sm"
            />
          </div>
          <div>
            <label htmlFor="req-desc" className="mb-1 block text-xs font-medium text-muted-foreground">
              Description
            </label>
            <textarea
              id="req-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input h-16 resize-none text-sm"
            />
          </div>
          <div>
            <label htmlFor="req-workflow" className="mb-1 block text-xs font-medium text-muted-foreground">
              Workflow *
            </label>
            <select
              id="req-workflow"
              value={form.workflowId}
              onChange={(e) => setForm({ ...form, workflowId: e.target.value })}
              className="input text-sm"
            >
              <option value="">Select workflow...</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.entityType})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="req-priority" className="mb-1 block text-xs font-medium text-muted-foreground">
              Priority
            </label>
            <select
              id="req-priority"
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value as (typeof PRIORITIES)[number] })
              }
              className="input text-sm"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!form.title || !form.workflowId || saving}
          >
            {saving ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateWorkflowDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    entityType: ENTITY_TYPES[0] as string,
  });
  const [steps, setSteps] = useState<{ id: string; approverRole: string }[]>([
    { id: crypto.randomUUID(), approverRole: 'Manager' },
  ]);
  const [saving, setSaving] = useState(false);

  function addStep() {
    setSteps([...steps, { id: crypto.randomUUID(), approverRole: 'Partner' }]);
  }
  function removeStep(id: string) {
    setSteps(steps.filter((s) => s.id !== id));
  }
  function updateStep(id: string, approverRole: string) {
    setSteps(steps.map((s) => (s.id === id ? { ...s, approverRole } : s)));
  }

  async function submit() {
    if (!form.name || !steps.length) return;
    setSaving(true);
    try {
      await api.post('/approvals/workflows', {
        name: form.name,
        description: form.description || undefined,
        entityType: form.entityType,
        steps: steps.map((s, i) => ({
          stepOrder: i + 1,
          approverRole: s.approverRole,
        })),
      });
      onCreated();
      onOpenChange(false);
      setForm({ name: '', description: '', entityType: ENTITY_TYPES[0] });
      setSteps([{ id: crypto.randomUUID(), approverRole: 'Manager' }]);
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      void appAlert({
        title: 'Create failed',
        message: ax.response?.data?.error || 'Failed to create workflow',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Workflow</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="wf-name" className="mb-1 block text-xs font-medium text-muted-foreground">
              Name *
            </label>
            <input
              id="wf-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input text-sm"
            />
          </div>
          <div>
            <label htmlFor="wf-type" className="mb-1 block text-xs font-medium text-muted-foreground">
              Entity type
            </label>
            <select
              id="wf-type"
              value={form.entityType}
              onChange={(e) => setForm({ ...form, entityType: e.target.value })}
              className="input text-sm"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Steps</span>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <select
                    value={s.approverRole}
                    onChange={(e) => updateStep(s.id, e.target.value)}
                    className="input flex-1 text-sm"
                    aria-label={`Approver role for step ${i + 1}`}
                  >
                    {APPROVER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {steps.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove step ${i + 1}`}
                      onClick={() => removeStep(s.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addStep} className="mt-2 text-xs text-primary hover:underline">
              + Add step
            </button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!form.name || !steps.length || saving}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
