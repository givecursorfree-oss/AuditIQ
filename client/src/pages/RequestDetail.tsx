import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { PageBreadcrumbs } from '../components/layout/PageBreadcrumbs';
import { PanelCard } from '../components/layout/PanelCard';
import PageHeader from '../components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { LetterWorkflowStepper } from '@/components/mkd/LetterWorkflowStepper';
import { RequestDetailSkeleton } from '@/components/mkd/MkdSkeletons';
import {
  approveConfirmMessage,
  approveCreateButtonLabel,
  pluralizeEngagements,
} from '@/lib/engagementStatus';
import { LetterStatusBadge, RequestStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { useAppToast } from '@/context/AppToastContext';
import { appConfirm } from '@/context/AppDialogContext';
import { teamAssignmentPath } from '@/lib/teamAssignmentRoutes';

interface RequestEngagement {
  id: string;
  title: string;
  serviceCode?: string | null;
  letterStatus: string;
  requestStatus?: string | null;
  engagementLetter?: { id: string; status: string; generatedContent?: string | null } | null;
}

interface RequestDetail {
  id: string;
  status: string;
  notes?: string | null;
  selectedServices: string[];
  financialYears: string[];
  serviceLabels: string[];
  client: { name: string; contactEmail?: string | null; pan?: string | null };
  engagements: RequestEngagement[];
  engagement?: RequestEngagement | null;
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canReview = user?.role === 'Partner' || user?.role === 'Admin';
  const [data, setData] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const { showToast } = useAppToast();

  const primaryEngagementId = data?.engagements?.[0]?.id;

  async function load() {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get<RequestDetail>(`/requests/${id}`);
      setData(res.data);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setLoadError(ax.response?.data?.error || 'Failed to load request. Please try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function approve() {
    if (!id || !data) return;
    const count = data.serviceLabels.length;
    const ok = await appConfirm({
      title: 'Approve service request',
      message: approveConfirmMessage(data.client.name, count),
      confirmLabel: approveCreateButtonLabel(count),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.patch<{
        serviceCount: number;
        primaryEngagementId?: string;
      }>(`/requests/${id}/approve`);
      await load();
      const created = res.data.serviceCount ?? count;
      showToast({
        title: `${pluralizeEngagements(created)} created`,
        message: 'Open the engagement letter workflow to generate and send the letter.',
        variant: 'success',
      });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      showToast({
        title: 'Approve failed',
        message: ax.response?.data?.error || 'Could not approve this request.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AppPageContainer>
        <PageBreadcrumbs items={[{ label: 'Client Requests', to: '/requests' }, { label: 'Request' }]} />
        <PageHeader title="Request" description="Loading request details…" />
        <RequestDetailSkeleton />
      </AppPageContainer>
    );
  }

  if (loadError || !data) {
    return (
      <AppPageContainer>
        <PageBreadcrumbs items={[{ label: 'Client Requests', to: '/requests' }, { label: 'Request' }]} />
        <PageHeader title="Request unavailable" description={loadError || 'Request not found'} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
          <Button type="button" variant="secondary" asChild>
            <Link to="/requests">Back to queue</Link>
          </Button>
        </div>
      </AppPageContainer>
    );
  }

  const engagements = data.engagements ?? (data.engagement ? [data.engagement] : []);
  const primaryLetterStatus = engagements[0]?.letterStatus ?? 'not_required';
  const serviceCount = data.serviceLabels.length;
  const showApprove = data.status === 'pending' && canReview;

  return (
    <AppPageContainer>
      <PageBreadcrumbs
        items={[{ label: 'Client Requests', to: '/requests' }, { label: data.client.name }]}
      />
      <PageHeader
        title={data.client.name}
        description={`${serviceCount} service${serviceCount === 1 ? '' : 's'} · FY ${data.financialYears.join(', ')}`}
        badge={<RequestStatusBadge status={data.status} />}
        actions={
          <>
            {showApprove && (
              <Button type="button" size="sm" variant="success" disabled={busy} onClick={() => void approve()}>
                {approveCreateButtonLabel(serviceCount, busy)}
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/requests">Back to queue</Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <PanelCard title="Requested services" className="flex flex-col">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {data.serviceLabels.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Financial years: {data.financialYears.join(', ')}
          </p>
          {data.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{data.notes}</p>}
          {showApprove && (
            <p className="mt-4 text-sm text-muted-foreground">
              Use <span className="font-medium text-foreground">Approve & create</span> above to start the
              engagement letter workflow.
            </p>
          )}
        </PanelCard>

        <PanelCard title="Engagement letter workflow" className="flex flex-col">
          <LetterWorkflowStepper
            requestStatus={data.status}
            letterStatus={primaryLetterStatus}
            hasEngagement={engagements.length > 0}
          />
          {engagements.length > 0 && primaryEngagementId && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Letter is managed on the primary engagement. Signing unlocks all{' '}
                {pluralizeEngagements(engagements.length)}.
              </p>
              <Button type="button" size="sm" asChild>
                <Link
                  to={
                    primaryLetterStatus === 'signed'
                      ? teamAssignmentPath(primaryEngagementId)
                      : `/engagements/${primaryEngagementId}/letter`
                  }
                >
                  {primaryLetterStatus === 'signed' ? 'Assign team' : 'Open letter workflow'}
                </Link>
              </Button>
            </div>
          )}
        </PanelCard>
      </div>

      {engagements.length > 0 && (
        <PanelCard title={`Engagements (${engagements.length})`}>
          <div className="divide-y divide-border">
            {engagements.map((eng) => (
              <div
                key={eng.id}
                className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{eng.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <LetterStatusBadge status={eng.letterStatus} />
                    {eng.serviceCode && <span>{eng.serviceCode}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to={`/engagements/${eng.id}`}>Pipeline</Link>
                  </Button>
                  {eng.id === primaryEngagementId && (
                    <Button type="button" size="sm" asChild>
                      <Link
                        to={
                          eng.letterStatus === 'signed'
                            ? teamAssignmentPath(eng.id)
                            : `/engagements/${eng.id}/letter`
                        }
                      >
                        {eng.letterStatus === 'signed' ? 'Assign team' : 'Letter'}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PanelCard>
      )}
    </AppPageContainer>
  );
}
