import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/services/api';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

export default function ClaimsPending() {
  const [lateHours, setLateHours] = useState<{ id: string; reason: string; staff: { firstName: string; lastName: string } }[]>([]);
  const [deptVisits, setDeptVisits] = useState<{ id: string; purpose: string; staff: { firstName: string; lastName: string } }[]>([]);

  async function load() {
    const { data } = await api.get<{
      lateHours: typeof lateHours;
      deptVisits: typeof deptVisits;
    }>('/claims/pending');
    setLateHours(data.lateHours);
    setDeptVisits(data.deptVisits);
  }

  useEffect(() => {
    void load();
  }, []);

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
      <div className="grid gap-4 md:grid-cols-2">
        <PanelCard title="Late hours">
          {lateHours.length === 0 ? (
            <p className="text-sm text-muted-foreground">None pending</p>
          ) : (
            lateHours.map((c) => (
              <div key={c.id} className="border-b py-2 text-sm flex justify-between gap-2">
                <span>{c.staff.firstName} {c.staff.lastName}: {c.reason.slice(0, 60)}</span>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" onClick={() => void api.patch(`/claims/late-hours/${c.id}/approve`, {}).then(load)}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => void api.patch(`/claims/late-hours/${c.id}/reject`, { managerNotes: 'Rejected' }).then(load)}>Reject</Button>
                </div>
              </div>
            ))
          )}
        </PanelCard>
        <PanelCard title="Dept visits">
          {deptVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground">None pending</p>
          ) : (
            deptVisits.map((c) => (
              <div key={c.id} className="border-b py-2 text-sm flex justify-between gap-2">
                <span>{c.staff.firstName} {c.staff.lastName}: {c.purpose.slice(0, 60)}</span>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" onClick={() => void api.patch(`/claims/dept-visit/${c.id}/approve`, {}).then(load)}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => void api.patch(`/claims/dept-visit/${c.id}/reject`, { managerNotes: 'Rejected' }).then(load)}>Reject</Button>
                </div>
              </div>
            ))
          )}
        </PanelCard>
      </div>
    </AppPageContainer>
  );
}
