import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Warning } from '@phosphor-icons/react';
import api from '@/services/api';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import PageLoading from '@/components/layout/PageLoading';
import { EmptyState } from '@/components/layout/EmptyState';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { formatApiError } from '@/lib/apiErrors';

type Verification = {
  flagged: boolean;
  flagReason: string | null;
  computerMismatchMinutes: number | null;
  fingerprintMismatchMinutes: number | null;
};

type LateHoursRow = {
  id: string;
  reason: string;
  actualEndTime: string;
  computerLogoffTime?: string | null;
  fingerprintLogoffTime?: string | null;
  staff: { firstName: string; lastName: string };
  verification?: Verification;
};

type DeptVisitRow = {
  id: string;
  purpose: string;
  staff: { firstName: string; lastName: string };
};

export default function ClaimsPending() {
  const [lateHours, setLateHours] = useState<LateHoursRow[]>([]);
  const [deptVisits, setDeptVisits] = useState<DeptVisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    setLoading(true);
    try {
      const { data } = await api.get<{ lateHours: LateHoursRow[]; deptVisits: DeptVisitRow[] }>('/claims/pending');
      setLateHours(data.lateHours);
      setDeptVisits(data.deptVisits);
    } catch (e) {
      setLoadError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function approveLateHours(c: LateHoursRow, force = false) {
    try {
      await api.patch(`/claims/late-hours/${c.id}/approve`, force ? { forceApprove: true, managerNotes: 'Override after review' } : {});
      await load();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409 && !force) {
        const ok = await appConfirm({
          title: 'Approve anyway?',
          message: c.verification?.flagReason ?? 'Times mismatch log-off records.',
          confirmLabel: 'Approve anyway',
        });
        if (ok) await approveLateHours(c, true);
        return;
      }
      void appAlert({ title: 'Approve failed', message: formatApiError(err) });
    }
  }

  async function rejectLateHours(id: string) {
    try {
      await api.patch(`/claims/late-hours/${id}/reject`, { managerNotes: 'Rejected' });
      await load();
    } catch (e) {
      void appAlert({ title: 'Reject failed', message: formatApiError(e) });
    }
  }

  async function approveDeptVisit(id: string) {
    try {
      await api.patch(`/claims/dept-visit/${id}/approve`, {});
      await load();
    } catch (e) {
      void appAlert({ title: 'Approve failed', message: formatApiError(e) });
    }
  }

  async function rejectDeptVisit(id: string) {
    try {
      await api.patch(`/claims/dept-visit/${id}/reject`, { managerNotes: 'Rejected' });
      await load();
    } catch (e) {
      void appAlert({ title: 'Reject failed', message: formatApiError(e) });
    }
  }

  if (loading) {
    return (
      <AppPageContainer>
        <PageHeader title="Claim approvals" description="Late hours and department visit claims" />
        <PageLoading />
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer>
      <PageHeader
        title="Claim approvals"
        description="Late hours and department visit claims"
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline"><Link to="/claims/new/late-hours">Late hours</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/claims/new/dept-visit">Dept visit</Link></Button>
          </div>
        }
      />
      {loadError && <ErrorBanner message={loadError} onRetry={() => void load()} className="mb-4" />}
      <div className="grid gap-4 md:grid-cols-2">
        <PanelCard title="Late hours">
          {lateHours.length === 0 ? (
            <EmptyState title="No late hours pending" className="py-6" />
          ) : (
            lateHours.map((c) => (
              <div key={c.id} className="border-b py-3 text-sm space-y-2">
                <div className="flex justify-between gap-2">
                  <span>{c.staff.firstName} {c.staff.lastName}: {c.reason.slice(0, 60)}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="success" onClick={() => void approveLateHours(c)}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => void rejectLateHours(c.id)}>Reject</Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground grid grid-cols-3 gap-2">
                  <span>Claimed end: {c.actualEndTime}</span>
                  <span>PC log-off: {c.computerLogoffTime ?? '—'}</span>
                  <span>Fingerprint: {c.fingerprintLogoffTime ?? '—'}</span>
                </div>
                {c.verification?.flagged && (
                  <Badge variant="outline" className="text-amber-700 border-amber-500/40 gap-1">
                    <Warning size={12} /> {c.verification.flagReason}
                  </Badge>
                )}
              </div>
            ))
          )}
        </PanelCard>
        <PanelCard title="Dept visits">
          {deptVisits.length === 0 ? (
            <EmptyState title="No dept visits pending" className="py-6" />
          ) : (
            deptVisits.map((c) => (
              <div key={c.id} className="border-b py-2 text-sm flex justify-between gap-2">
                <span>{c.staff.firstName} {c.staff.lastName}: {c.purpose.slice(0, 60)}</span>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="success" onClick={() => void approveDeptVisit(c.id)}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => void rejectDeptVisit(c.id)}>Reject</Button>
                </div>
              </div>
            ))
          )}
        </PanelCard>
      </div>
    </AppPageContainer>
  );
}
