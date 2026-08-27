import { useCallback, useEffect, useMemo, useState } from 'react';
import { DownloadSimple, ArrowsClockwise, Buildings, Briefcase, House, MapPin } from '@phosphor-icons/react';
import api from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PanelCard } from '@/components/layout/PanelCard';
import { EmptyState, LoadingCenter } from '@/components/layout/StatePanels';
import { formatDuration, formatHoursDecimal } from '@/lib/time';
import { cn } from '@/lib/utils';

const todayDateFormatter = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export interface StaffStatusRow {
  staffId: string;
  name: string;
  initials: string;
  role: string;
  designation?: string | null;
  activityStatus: 'active' | 'away' | 'offline';
  presenceStatus?: string;
  isAvailable?: boolean;
  awayMinutes: number | null;
  clockInTime: string | null;
  attendanceLocation?: string | null;
  attendanceClientName?: string | null;
  attendanceStatus?: string | null;
  attendanceCheckOut?: string | null;
  todayLoggedHours: number;
  currentEngagement: {
    id: string;
    name: string;
    clientName: string;
    stage: string;
  } | null;
  timerElapsedSeconds: number;
  timerIsPaused: boolean;
}

interface AdminPresenceDashboardProps {
  className?: string;
}

function isStaffAvailable(row: StaffStatusRow): boolean {
  if (typeof row.isAvailable === 'boolean') return row.isAvailable;
  if (row.presenceStatus) return row.presenceStatus !== 'offline';
  return row.activityStatus !== 'offline';
}

function statusBadge(row: StaffStatusRow) {
  if (isStaffAvailable(row)) {
    return (
      <Badge variant="success" className="gap-1">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Available
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <span className="size-1.5 rounded-full bg-muted-foreground/50" aria-hidden /> Offline
    </Badge>
  );
}

function locationBadge(row: StaffStatusRow) {
  const loc = row.attendanceLocation;
  if (loc === 'Office') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
        <Buildings size={13} className="shrink-0" />
        Office
      </span>
    );
  }
  if (loc === 'Client Place') {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded w-fit">
          <Briefcase size={13} className="shrink-0" />
          Client Place
        </span>
        {row.attendanceClientName && (
          <span className="text-xs text-muted-foreground truncate max-w-[170px]" title={row.attendanceClientName}>
            {row.attendanceClientName}
          </span>
        )}
      </div>
    );
  }
  if (loc === 'Work from Home') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
        <House size={13} className="shrink-0" />
        WFH
      </span>
    );
  }
  if (row.clockInTime) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin size={13} />
        Checked in
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function exportCsv(rows: StaffStatusRow[]) {
  const header = [
    'Staff',
    'Role',
    'Status',
    'Attendance Location',
    'Attendance Client',
    'Active Engagement',
    'Engagement Client',
    'Stage',
    'Time on task',
    'Clock-in',
    'Today logged (h)',
  ];
  const lines = rows.map((r) => [
    r.name,
    r.role,
    r.activityStatus,
    r.attendanceLocation ?? '',
    r.attendanceClientName ?? '',
    r.currentEngagement?.name ?? '',
    r.currentEngagement?.clientName ?? '',
    r.currentEngagement?.stage ?? '',
    r.timerElapsedSeconds > 0 ? formatDuration(r.timerElapsedSeconds) : '',
    r.clockInTime ? new Date(r.clockInTime).toLocaleTimeString('en-IN') : '',
    r.todayLoggedHours.toFixed(2),
  ]);
  const csv = [header, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `team-presence-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPresenceDashboard({ className }: AdminPresenceDashboardProps) {
  const [rows, setRows] = useState<StaffStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffLog, setStaffLog] = useState<
    { id: string; date: string; hours: number; stage: string | null; engagement: { title: string } }[]
  >([]);

  const load = useCallback(async () => {
    try {
      const r = await api.get<StaffStatusRow[]>('/staff/statuses');
      setRows(Array.isArray(r.data) ? r.data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!selectedStaffId) {
      setStaffLog([]);
      return;
    }
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    void api
      .get(`/time-entries?userId=${selectedStaffId}&from=${from.toISOString()}`)
      .then((r) => setStaffLog(Array.isArray(r.data) ? r.data : []))
      .catch(() => setStaffLog([]));
  }, [selectedStaffId]);

  const onlineCount = rows.filter((r) => isStaffAvailable(r)).length;
  const officeCount = rows.filter((r) => r.attendanceLocation === 'Office').length;
  const clientCount = rows.filter((r) => r.attendanceLocation === 'Client Place').length;
  const wfhCount = rows.filter((r) => r.attendanceLocation === 'Work from Home').length;
  const todayLabel = todayDateFormatter.format(new Date());

  return (
    <PanelCard
      className={cn('mb-4 sm:mb-6', className)}
      title="Team presence & location"
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} aria-label="Refresh team presence">
            <ArrowsClockwise size={14} className="mr-1" aria-hidden /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCsv(rows)} disabled={rows.length === 0}>
            <DownloadSimple size={14} className="mr-1" aria-hidden /> Export CSV
          </Button>
        </div>
      }
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs text-muted-foreground border-b border-border">
        <span>{todayLabel}</span>
        <span>•</span>
        <span>{onlineCount} of {rows.length} available</span>
        <span>•</span>
        <div className="flex items-center gap-3 text-foreground">
          <span className="inline-flex items-center gap-1 font-medium">
            <Buildings size={14} className="text-muted-foreground" aria-hidden />
            <span>{officeCount}</span>
            <span className="text-muted-foreground font-normal">Office</span>
          </span>
          <span className="inline-flex items-center gap-1 font-medium">
            <Briefcase size={14} className="text-muted-foreground" aria-hidden />
            <span>{clientCount}</span>
            <span className="text-muted-foreground font-normal">Client Place</span>
          </span>
          <span className="inline-flex items-center gap-1 font-medium">
            <House size={14} className="text-muted-foreground" aria-hidden />
            <span>{wfhCount}</span>
            <span className="text-muted-foreground font-normal">WFH</span>
          </span>
        </div>
      </div>

      {loading ? (
        <LoadingCenter label="Loading team presence…" className="py-12" />
      ) : rows.length === 0 ? (
        <EmptyState title="No staff records" description="Team presence will appear when staff clock in." className="py-10" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Team presence: staff availability, location, current engagement, and logged hours</caption>
            <thead>
              <tr className="table-header text-left border-b border-border">
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Location (Attendance)</th>
                <th className="px-4 py-3 font-medium">Active task</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Time on task</th>
                <th className="px-4 py-3 font-medium">Clock-in</th>
                <th className="px-4 py-3 font-medium">Today logged</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.staffId}
                  className={cn(
                    'border-b border-border/60 last:border-0 cursor-pointer hover:bg-hover-bg/60',
                    selectedStaffId === r.staffId && 'bg-primary/5'
                  )}
                  onClick={() => setSelectedStaffId(r.staffId === selectedStaffId ? null : r.staffId)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.designation || r.role}</div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(r)}</td>
                  <td className="px-4 py-3 min-w-[160px]">{locationBadge(r)}</td>
                  <td className="px-4 py-3 max-w-[180px] truncate">
                    {r.currentEngagement ? (
                      <>
                        <div className="truncate">{r.currentEngagement.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.currentEngagement.clientName}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">
                    {r.currentEngagement?.stage ?? '—'}
                    {r.timerIsPaused && <span className="text-amber-600 ml-1">(paused)</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums">
                    {r.timerElapsedSeconds > 0 ? formatDuration(r.timerElapsedSeconds) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {r.clockInTime
                      ? new Date(r.clockInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">{formatHoursDecimal(r.todayLoggedHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedStaffId && staffLog.length > 0 && (
        <div className="border-t border-border p-4 bg-muted/30">
          <h4 className="text-xs font-semibold text-foreground mb-2">
            Today&apos;s time log — {rows.find((r) => r.staffId === selectedStaffId)?.name}
          </h4>
          <ul className="space-y-1 text-xs">
            {staffLog.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="truncate">{e.engagement.title}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {e.stage ?? '—'} · {e.hours.toFixed(2)}h
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PanelCard>
  );
}
