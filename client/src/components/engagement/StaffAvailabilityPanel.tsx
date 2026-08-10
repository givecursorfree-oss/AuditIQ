import { useCallback, useEffect, useState } from 'react';
import api from '@/services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ScheduleData {
  staff: { firstName: string; lastName: string };
  activeTaskCount: number;
  workloadHoursThisWeek: number;
  activeTasks: { title: string; displayStatus?: string; engagement?: { title: string } }[];
  upcomingDeadlines: { taskName: string; engagementName: string; deadline: string }[];
  availability: { date: string; hoursAllocated: number; isBusy: boolean }[];
}

interface Props {
  staffId: string | null;
  open: boolean;
  onClose: () => void;
}

const SCHEDULE_POLL_MS = 15_000;

function StaffScheduleBody({ staffId }: { staffId: string }) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<ScheduleData>(`/staff/${staffId}/schedule?days=14`);
      setData(r.data);
    } catch {
      /* keep last snapshot */
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    void loadSchedule();
    const interval = window.setInterval(() => void loadSchedule(), SCHEDULE_POLL_MS);
    return () => window.clearInterval(interval);
  }, [loadSchedule]);

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Could not load schedule.</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      <p>
        <strong>{data.activeTaskCount}</strong> active tasks · ~<strong>{data.workloadHoursThisWeek}</strong> hrs
        this week
      </p>
      {data.activeTasks.length > 0 && (
        <div>
          <div className="font-medium mb-1">Active tasks</div>
          <ul className="list-disc pl-4 space-y-1">
            {data.activeTasks.map((t) => (
              <li key={`${t.title}:${t.engagement?.title ?? ''}`}>
                {t.title}
                {t.engagement?.title ? ` (${t.engagement.title})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="font-medium mb-1">Next 14 days</div>
        <div className="grid grid-cols-7 gap-1">
          {data.availability.slice(0, 14).map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.hoursAllocated}h`}
              className={`rounded p-1 text-center text-[10px] border ${
                d.isBusy ? 'bg-destructive/15 border-destructive/40' : 'bg-muted/40'
              }`}
            >
              {d.date.slice(8)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StaffAvailabilityPanel({ staffId, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Staff availability</DialogTitle>
          <DialogDescription>
            Live workload for the next 14 days. Updates automatically while this panel is open.
          </DialogDescription>
        </DialogHeader>
        {open && staffId ? <StaffScheduleBody key={staffId} staffId={staffId} /> : null}
      </DialogContent>
    </Dialog>
  );
}
