import { useEffect, useState } from 'react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Timesheet {
  date: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  totalHoursWorked: number;
  taskBreakdown: {
    taskName: string;
    engagementName: string;
    clientName: string;
    durationMinutes: number;
  }[];
}

export default function Timesheets() {
  const { user } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sheet, setSheet] = useState<Timesheet | null>(null);

  useEffect(() => {
    if (!user) return;
    void api
      .get<Timesheet>(`/timesheets?staffId=${user.id}&date=${date}`)
      .then((r) => setSheet(r.data));
  }, [user, date]);

  return (
    <AppPageContainer>
      <PageHeader title="Timesheets" description="Daily hours from task timers" />
      <div className="mb-4 max-w-xs">
        <Label>Date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <PanelCard title={sheet ? `Total: ${sheet.totalHoursWorked} hrs` : 'Loading…'}>
        {sheet && (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              Clock in: {sheet.clockInTime ? new Date(sheet.clockInTime).toLocaleTimeString() : '—'} · Clock out:{' '}
              {sheet.clockOutTime ? new Date(sheet.clockOutTime).toLocaleTimeString() : '—'}
            </p>
            {sheet.taskBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No time logged this day.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="py-2">Task</th>
                    <th className="py-2">Engagement</th>
                    <th className="py-2">Client</th>
                    <th className="py-2">Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.taskBreakdown.map((row) => (
                    <tr key={`${row.taskName}:${row.engagementName}:${row.clientName}:${row.durationMinutes}`} className="border-b border-border/50">
                      <td className="py-2">{row.taskName}</td>
                      <td className="py-2">{row.engagementName}</td>
                      <td className="py-2">{row.clientName}</td>
                      <td className="py-2">{row.durationMinutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </PanelCard>
    </AppPageContainer>
  );
}
