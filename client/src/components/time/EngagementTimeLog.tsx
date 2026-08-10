import { useEffect, useMemo, useState } from 'react';
import { DownloadSimple } from '@phosphor-icons/react';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { formatHoursDecimal } from '@/lib/time';

interface TimeLogEntry {
  id: string;
  date: string;
  hours: number;
  stage: string | null;
  workType: string | null;
  user: { firstName: string; lastName: string };
}

interface EngagementTimeLogProps {
  engagementId: string;
  engagementTitle: string;
  clientName?: string;
  showHeader?: boolean;
}

function EngagementTimeLogBody({
  engagementId,
  engagementTitle,
  clientName,
  showHeader,
}: EngagementTimeLogProps) {
  const [entries, setEntries] = useState<TimeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<TimeLogEntry[]>(`/time-entries?engagementId=${engagementId}`)
      .then((r) => {
        if (!cancelled) setEntries(r.data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  const totalHours = useMemo(() => entries.reduce((s, e) => s + e.hours, 0), [entries]);

  const grouped = useMemo(() => {
    const map = new Map<string, TimeLogEntry[]>();
    for (const e of entries) {
      const day = new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const list = map.get(day) ?? [];
      list.push(e);
      map.set(day, list);
    }
    return Array.from(map.entries());
  }, [entries]);

  function exportCsv() {
    const header = ['Date', 'Staff', 'Stage', 'Work Type', 'Hours'];
    const lines = entries.map((e) => [
      new Date(e.date).toLocaleDateString('en-IN'),
      `${e.user.firstName} ${e.user.lastName}`,
      e.stage ?? '',
      e.workType ?? '',
      e.hours.toFixed(2),
    ]);
    const csv = [header, ...lines].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `time-log-${engagementTitle.slice(0, 30).replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{engagementTitle}</h3>
            {clientName && <p className="text-xs text-muted-foreground mt-0.5">Client: {clientName}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
            <DownloadSimple size={14} className="mr-1" /> Export CSV
          </Button>
        </div>
      )}
      {!showHeader && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
            <DownloadSimple size={14} className="mr-1" /> Export CSV
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header text-left border-b border-border">
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Staff</th>
              <th className="px-4 py-2.5">Stage</th>
              <th className="px-4 py-2.5">Duration</th>
            </tr>
          </thead>
          <tbody>
            {grouped.flatMap(([day, dayEntries]) =>
              dayEntries.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2">{day}</td>
                  <td className="px-4 py-2">{e.user.firstName} {e.user.lastName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{e.stage ?? e.workType ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{formatHoursDecimal(e.hours)}</td>
                </tr>
              ))
            )}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  No time logged on this engagement yet
                </td>
              </tr>
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td colSpan={3} className="px-4 py-2.5 text-right">Total (billable basis)</td>
                <td className="px-4 py-2.5 font-mono text-xs">{formatHoursDecimal(totalHours)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default function EngagementTimeLog(props: EngagementTimeLogProps) {
  return <EngagementTimeLogBody key={props.engagementId} {...props} />;
}
