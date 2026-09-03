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
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
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
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [items, setItems] = useState<CalItem[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<DashboardCompliancePayload>('/dashboard/compliance-calendar')
      .then((r) => {
        setItems(mapComplianceDashboardToItems(r.data));
        setLoadError(null);
      })
      .catch(() => {
        setItems([]);
        setLoadError('Failed to load.');
      });
  }, []);

  const filtered = items.filter((i) => domain === 'all' || i.domain === domain);
  const drawerItems = drawerDate
    ? filtered.filter((i) => i.dueDate.startsWith(drawerDate))
    : [];

  return (
    <AppPageContainer>
      <PageHeader title="Compliance calendar" description="Statutory and engagement deadlines" />
      {loadError && <p className="text-sm text-destructive mb-4">{loadError}</p>}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Select value={domain} onValueChange={(v) => setDomain(v as typeof domain)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="DT">Direct tax</SelectItem>
            <SelectItem value="IDT">Indirect tax</SelectItem>
          </SelectContent>
        </Select>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <PanelCard>
        {view === 'calendar' ? (
        <ComplianceMonthCalendar
          month={month}
          onMonthChange={setMonth}
          items={filtered}
          onDateClick={setDrawerDate}
        />
        ) : (
          <ul className="divide-y text-sm">
            {filtered
              .slice()
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .map((item) => (
                <li key={item.id} className="py-2 flex justify-between gap-2">
                  <span>
                    <span className="text-muted-foreground">{item.dueDate}</span>
                    {' · '}
                    {item.title}
                    {item.clientName ? ` · ${item.clientName}` : ''}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => exportIcs(item)}>.ics</Button>
                </li>
              ))}
            {filtered.length === 0 && (
              <li className="py-4 text-muted-foreground">No deadlines in range.</li>
            )}
          </ul>
        )}
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
