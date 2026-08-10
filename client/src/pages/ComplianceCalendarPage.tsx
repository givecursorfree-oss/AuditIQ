import { useEffect, useState } from 'react';
import api from '../services/api';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import { PanelCard } from '../components/layout/PanelCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import ComplianceMonthCalendar from '../components/compliance/ComplianceMonthCalendar';
import {
  mapComplianceDashboardToItems,
  type CalItem,
  type DashboardCompliancePayload,
} from '../lib/mapComplianceDashboard';

function exportIcs(item: CalItem) {
  const start = item.dueDate.replace(/-/g, '').slice(0, 8);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${start}`,
    `SUMMARY:${item.title}`,
    `DESCRIPTION:${item.clientName || ''}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${item.title.slice(0, 30)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ComplianceCalendarPage() {
  const [domain, setDomain] = useState<'all' | 'DT' | 'IDT'>('all');
  const [items, setItems] = useState<CalItem[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [drawerDate, setDrawerDate] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<DashboardCompliancePayload>('/dashboard/compliance-calendar')
      .then((r) => setItems(mapComplianceDashboardToItems(r.data)))
      .catch(() => setItems([]));
  }, []);

  const filtered = items.filter((i) => domain === 'all' || i.domain === domain);
  const drawerItems = drawerDate
    ? filtered.filter((i) => i.dueDate.startsWith(drawerDate))
    : [];

  return (
    <AppPageContainer>
      <PageHeader title="Compliance calendar" description="Statutory and engagement deadlines" />
      <div className="flex gap-3 mb-4 items-center">
        <Select value={domain} onValueChange={(v) => setDomain(v as typeof domain)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="DT">Direct tax</SelectItem>
            <SelectItem value="IDT">Indirect tax</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <PanelCard>
        <ComplianceMonthCalendar
          month={month}
          onMonthChange={setMonth}
          items={filtered}
          onDateClick={setDrawerDate}
        />
      </PanelCard>
      <Dialog open={!!drawerDate} onOpenChange={(o) => !o && setDrawerDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Due {drawerDate}</DialogTitle>
          </DialogHeader>
          {drawerItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items this day.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {drawerItems.map((item) => (
                <li key={item.id} className="flex justify-between gap-2 border-b py-2">
                  <span>{item.title} {item.clientName ? `· ${item.clientName}` : ''}</span>
                  <Button size="sm" variant="ghost" onClick={() => exportIcs(item)}>.ics</Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </AppPageContainer>
  );
}
