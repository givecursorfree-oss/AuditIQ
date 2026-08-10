import { useEffect, useState } from 'react';

import { Link } from 'react-router-dom';

import { Check, X, FileText, CaretRight as ChevronRight } from '@phosphor-icons/react';

import api from '../services/api';

import { useAuth } from '../context/AuthContext';

import { AppPageContainer } from '../components/layout/AppPageContainer';

import { PanelCard } from '../components/layout/PanelCard';
import { EmptyState, ErrorBanner } from '../components/layout/StatePanels';

import PageHeader from '../components/layout/PageHeader';

import { Button } from '@/components/ui/button';

import {

  Dialog,

  DialogContent,

  DialogDescription,

  DialogFooter,

  DialogHeader,

  DialogTitle,

} from '@/components/ui/dialog';

import {
  approveConfirmMessage,
  approveCreateButtonLabel,
  pluralizeEngagements,
} from '@/lib/engagementStatus';
import { LetterWorkflowStatusBadge, RequestStatusBadge } from '@/components/mkd/WorkflowStatusBadge';

import { PendingRequestsSkeleton } from '@/components/mkd/MkdSkeletons';

import { useAppToast } from '@/context/AppToastContext';

import { appConfirm } from '@/context/AppDialogContext';
import { teamAssignmentPath } from '@/lib/teamAssignmentRoutes';



interface ClientRequestRow {

  id: string;

  status: string;

  submittedAt: string;

  notes?: string | null;

  selectedServices: string[];

  financialYears: string[];

  serviceLabels: string[];

  client: { id: string; name: string; contactEmail?: string | null };

  engagement?: {

    id: string;

    title: string;

    letterStatus: string;

    requestStatus?: string | null;

  } | null;

  engagements?: {

    id: string;

    title: string;

    letterStatus: string;

    serviceCode?: string | null;

  }[];

}



export default function PendingRequests() {

  const { user } = useAuth();

  const canReview = user?.role === 'Partner' || user?.role === 'Admin' || user?.role === 'Manager';

  const [requests, setRequests] = useState<ClientRequestRow[]>([]);

  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState('');

  const [rejectId, setRejectId] = useState<string | null>(null);

  const [rejectReason, setRejectReason] = useState('');

  const { showToast } = useAppToast();



  async function load() {

    setLoading(true);

    setError('');

    try {

      const q = filter === 'all' ? '' : `?status=${filter}`;

      const { data } = await api.get<ClientRequestRow[]>(`/requests${q}`);

      setRequests(data);

    } catch {

      setError('Failed to load client requests');

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => {

    void load();

  }, [filter]);



  async function approve(row: ClientRequestRow) {

    const count = row.serviceLabels.length;

    const ok = await appConfirm({

      title: 'Approve service request',

      message: approveConfirmMessage(row.client.name, count),

      confirmLabel: approveCreateButtonLabel(count),

    });

    if (!ok) return;

    setBusyId(row.id);

    try {

      const res = await api.patch<{ serviceCount: number; primaryEngagementId?: string }>(

        `/requests/${row.id}/approve`

      );

      await load();

      showToast({

        title: `${pluralizeEngagements(res.data.serviceCount ?? count)} created`,

        message: 'Open the letter workflow from the request queue.',

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

      setBusyId(null);

    }

  }



  async function confirmReject() {

    if (!rejectId) return;

    setBusyId(rejectId);

    try {

      await api.patch(`/requests/${rejectId}/reject`, { reason: rejectReason || undefined });

      setRejectId(null);

      setRejectReason('');

      await load();

      showToast({

        title: 'Request rejected',

        message: 'The client will see the rejection in their portal.',

        variant: 'success',

      });

    } catch (err: unknown) {

      const ax = err as { response?: { data?: { error?: string } } };

      showToast({

        title: 'Reject failed',

        message: ax.response?.data?.error || 'Could not reject this request.',

        variant: 'error',

      });

    } finally {

      setBusyId(null);

    }

  }



  return (

    <AppPageContainer>

      <PageHeader

        title="Client Requests"

        description="MKD service requests — approve, then generate engagement letter before team assignment"

      />

      <div className="flex flex-wrap gap-2 mb-4">

        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (

          <Button

            key={f}

            type="button"

            size="sm"

            variant={filter === f ? 'default' : 'outline'}

            onClick={() => setFilter(f)}

          >

            {f.charAt(0).toUpperCase() + f.slice(1)}

          </Button>

        ))}

      </div>



      {error && (
        <ErrorBanner message={error} onRetry={() => void load()} className="mb-4" />
      )}



      <PanelCard title="Request queue">

        {loading ? (

          <PendingRequestsSkeleton />

        ) : requests.length === 0 ? (

          <EmptyState title="No requests in this queue" />

        ) : (

          <div className="divide-y divide-border">

            {requests.map((r) => (

              <div key={r.id} className="flex flex-col justify-between gap-3 py-4 md:flex-row md:items-center">

                <div className="min-w-0">

                  <div className="flex flex-wrap items-center gap-2">

                    <div className="font-medium text-foreground">{r.client.name}</div>

                    <RequestStatusBadge status={r.status} />

                  </div>

                  <div className="mt-0.5 text-sm text-muted-foreground">

                    {r.serviceLabels.join(' · ')} — FY {r.financialYears.join(', ')}

                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">

                    <span>Submitted {new Date(r.submittedAt).toLocaleString('en-IN')}</span>

                    {(r.engagements?.length ?? (r.engagement ? 1 : 0)) > 0 && (

                      <span>· {pluralizeEngagements(r.engagements?.length ?? 1)}</span>

                    )}

                    {(r.engagements?.[0] ?? r.engagement) && (

                      <LetterWorkflowStatusBadge

                        context={{

                          requestStatus: r.status,

                          letterStatus: (r.engagements?.[0] ?? r.engagement)!.letterStatus,

                          hasEngagement: (r.engagements?.length ?? (r.engagement ? 1 : 0)) > 0,

                        }}

                      />

                    )}

                  </div>

                  {r.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.notes}</p>}

                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">

                  {r.status === 'pending' && canReview && (

                    <>

                      <Button

                        type="button"

                        size="sm"

                        disabled={busyId === r.id}

                        onClick={() => void approve(r)}

                      >

                        <Check size={16} className="mr-1" />

                        {busyId === r.id

                          ? 'Approving…'

                          : approveCreateButtonLabel(r.serviceLabels.length)}

                      </Button>

                      <Button

                        type="button"

                        size="sm"

                        variant="outline"

                        disabled={busyId === r.id}

                        onClick={() => setRejectId(r.id)}

                      >

                        <X size={16} className="mr-1" /> Reject

                      </Button>

                    </>

                  )}

                  {(r.engagements?.[0] ?? r.engagement) && (() => {
                    const primaryEng = (r.engagements?.[0] ?? r.engagement)!;
                    const signedNeedsTeam = primaryEng.letterStatus === 'signed';
                    return (
                    <Button type="button" size="sm" variant={signedNeedsTeam ? 'default' : 'outline'} asChild>
                      <Link
                        to={
                          signedNeedsTeam
                            ? teamAssignmentPath(primaryEng.id)
                            : `/engagements/${primaryEng.id}/letter`
                        }
                      >
                        {signedNeedsTeam ? (
                          <>Assign team <ChevronRight size={14} /></>
                        ) : (
                          <><FileText size={16} className="mr-1" /> Letter workflow <ChevronRight size={14} /></>
                        )}
                      </Link>
                    </Button>
                    );
                  })()}

                  <Link to={`/requests/${r.id}`} className="text-sm text-primary hover:underline">

                    Details

                  </Link>

                </div>

              </div>

            ))}

          </div>

        )}

      </PanelCard>



      <Dialog open={rejectId !== null} onOpenChange={(open) => !open && setRejectId(null)}>

        <DialogContent>

          <DialogHeader>

            <DialogTitle>Reject request</DialogTitle>

            <DialogDescription>Optional reason shown in the request record.</DialogDescription>

          </DialogHeader>

          <textarea

            className="input-field w-full min-h-[80px]"

            placeholder="Rejection reason (optional)"

            aria-label="Rejection reason"

            value={rejectReason}

            onChange={(e) => setRejectReason(e.target.value)}

          />

          <DialogFooter>

            <Button type="button" variant="outline" onClick={() => setRejectId(null)}>

              Cancel

            </Button>

            <Button type="button" variant="destructive" disabled={busyId === rejectId} onClick={() => void confirmReject()}>

              Reject request

            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>

    </AppPageContainer>

  );

}


