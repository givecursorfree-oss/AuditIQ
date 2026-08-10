import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '@/services/api';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import PageHeader from '@/components/layout/PageHeader';
import StaffAvailabilityPanel from '@/components/engagement/StaffAvailabilityPanel';
import { PanelCard } from '@/components/layout/PanelCard';
import { Button } from '@/components/ui/button';

export default function StaffSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const [open, setOpen] = useState(true);
  const [staffName, setStaffName] = useState<string | null>(null);

  useEffect(() => {
    setOpen(true);
    if (!id) return;
    void api
      .get<{ firstName: string; lastName: string }>(`/employees/${id}`)
      .then(({ data }) => setStaffName(`${data.firstName} ${data.lastName}`.trim()))
      .catch(() => setStaffName(null));
  }, [id]);

  const title = staffName ? `${staffName} — schedule` : 'Staff schedule';

  return (
    <AppPageContainer>
      <PageBreadcrumbs
        items={[
          { label: 'Employees', to: '/employees' },
          { label: staffName || 'Schedule' },
        ]}
      />
      <PageHeader title={title} description="Workload and availability for task assignment" />
      {id && open && (
        <StaffAvailabilityPanel staffId={id} open={open} onClose={() => setOpen(false)} />
      )}
      {id && !open && (
        <PanelCard>
          <p className="text-sm text-muted-foreground mb-4">Schedule panel closed.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setOpen(true)}>
              Reopen schedule
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/employees">Back to employees</Link>
            </Button>
          </div>
        </PanelCard>
      )}
    </AppPageContainer>
  );
}
