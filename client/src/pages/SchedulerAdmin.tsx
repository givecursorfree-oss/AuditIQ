import { useEffect, useState } from 'react';
import { Calendar, PencilSimple, Play } from '@phosphor-icons/react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { PanelCard } from '../components/layout/PanelCard';
import PageHeader from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

interface UpcomingItem {
  date: string;
  rule: { name: string; serviceCode: string; category: string; frequency: string };
  clientName?: string;
  scheduleId?: string;
  nextCreateAt?: string | null;
}

interface RecurringClient {
  id: string;
  name: string;
  recurringAutomationDisabled: boolean;
  engagements: { id: string; title: string; serviceCode: string | null }[];
}

interface ClientSchedule {
  id: string;
  engagementTemplateId: string;
  clientId: string;
  isActive: boolean;
  frequency: string;
  triggerDay: number | null;
  triggerTime: string;
  nextCreateAt: string | null;
  autoSendDataRequestLetter: boolean;
  autoCreateStartDate: string;
  autoCreateEndDate: string | null;
}

export default function SchedulerAdmin() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Partner' || user?.role === 'Admin';
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [schedule, setSchedule] = useState<UpcomingItem['rule'][]>([]);
  const [recurringClients, setRecurringClients] = useState<RecurringClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [runResult, setRunResult] = useState('');
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [clientSchedules, setClientSchedules] = useState<ClientSchedule[]>([]);
  const [editing, setEditing] = useState<ClientSchedule | null>(null);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const [schedRes, clientsRes] = await Promise.all([
        api.get<{ upcoming: UpcomingItem[]; schedule: UpcomingItem['rule'][] }>('/scheduler/upcoming?days=60'),
        api.get<RecurringClient[]>('/scheduler/recurring-clients').catch(() => ({ data: [] as RecurringClient[] })),
      ]);
      setUpcoming(schedRes.data.upcoming);
      setSchedule(schedRes.data.schedule);
      setRecurringClients(clientsRes.data);
    } catch {
      setLoadError('Failed to load scheduler. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openEditSchedules(clientId: string) {
    setEditClientId(clientId);
    const { data } = await api.get<ClientSchedule[]>(`/recurring-schedules?clientId=${clientId}`);
    setClientSchedules(data);
  }

  async function saveSchedule() {
    if (!editing) return;
    await api.patch(`/recurring-schedules/${editing.id}`, {
      isActive: editing.isActive,
      frequency: editing.frequency,
      triggerDay: editing.triggerDay ?? undefined,
      triggerTime: editing.triggerTime,
      autoSendDataRequestLetter: editing.autoSendDataRequestLetter,
      autoCreateStartDate: editing.autoCreateStartDate.slice(0, 10),
      autoCreateEndDate: editing.autoCreateEndDate ? editing.autoCreateEndDate.slice(0, 10) : null,
    });
    setEditing(null);
    if (editClientId) await openEditSchedules(editClientId);
    await load();
  }

  async function runNow() {
    setRunResult('Running…');
    try {
      const { data } = await api.post<{ created: number; emailsScheduled: number }>('/scheduler/run');
      setRunResult(`Created ${data.created} period(s), scheduled ${data.emailsScheduled} email(s).`);
      await load();
    } catch {
      setRunResult('Scheduler run failed.');
    }
  }

  async function toggleRecurring(clientId: string, disabled: boolean) {
    try {
      await api.patch(`/clients/${clientId}/recurring-automation`, { disabled });
      setRecurringClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, recurringAutomationDisabled: disabled } : c))
      );
    } catch {
      setRunResult('Failed to update recurring automation for client.');
    }
  }

  return (
    <AppPageContainer>
      <PageHeader
        title="Compliance Scheduler"
        description="Recurring GSTR, TDS, Advance Tax, and TP triggers for enrolled clients"
        actions={
          isAdmin ? (
            <Button type="button" size="sm" className="gap-1" onClick={() => void runNow()}>
              <Play size={16} /> Run now
            </Button>
          ) : undefined
        }
      />
      {loadError && (
        <div className="card p-3 text-sm text-destructive mb-4 flex justify-between gap-2">
          <span>{loadError}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
      {runResult && <div className="card p-3 text-sm mb-4">{runResult}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard title="Active rules">
          <ul className="text-sm space-y-2">
            {schedule.map((r) => (
              <li key={r.serviceCode} className="flex justify-between gap-2 border-b border-border pb-2">
                <span>{r.name}</span>
                <span className="text-foreground-muted capitalize shrink-0">{r.frequency}</span>
              </li>
            ))}
          </ul>
        </PanelCard>

        <PanelCard title="Upcoming triggers (60 days)">
          {loading ? (
            <div className="py-8 text-center text-foreground-muted">Loading…</div>
          ) : upcoming.length === 0 ? (
            <div className="py-8 text-center text-foreground-muted">No triggers in the next 60 days.</div>
          ) : (
            <ul className="text-sm space-y-2 max-h-80 overflow-auto">
              {upcoming.map((u, i) => (
                <li key={`${u.date}-${u.rule.serviceCode}-${u.clientName}-${i}`} className="flex items-start gap-2">
                  <Calendar size={14} className="text-foreground-muted shrink-0 mt-0.5" />
                  <span className="text-foreground-muted w-24 shrink-0">{u.date}</span>
                  <span className="flex-1">
                    {u.rule.name}
                    {u.clientName ? <span className="text-foreground-muted"> — {u.clientName}</span> : null}
                    {u.nextCreateAt ? (
                      <span className="block text-xs text-foreground-muted">Next: {u.nextCreateAt}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      {isAdmin && (
        <PanelCard title="Recurring automation by client" className="mt-4">
          {recurringClients.length === 0 ? (
            <p className="text-sm text-foreground-muted py-4">No clients enrolled in recurring engagements yet.</p>
          ) : (
            <ul className="text-sm space-y-3">
              {recurringClients.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-foreground-muted">
                      {c.engagements.map((e) => e.serviceCode ?? e.title).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => void openEditSchedules(c.id)}>
                      <PencilSimple size={14} className="mr-1" /> Edit schedules
                    </Button>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={c.recurringAutomationDisabled}
                        onChange={(e) => void toggleRecurring(c.id, e.target.checked)}
                      />
                      Pause automation
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      )}

      <Dialog open={!!editClientId} onOpenChange={(open) => !open && setEditClientId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client recurring schedules</DialogTitle>
          </DialogHeader>
          <ul className="text-sm space-y-2 max-h-64 overflow-auto">
            {clientSchedules.map((s) => (
              <li key={s.id} className="flex justify-between items-center gap-2 border-b pb-2">
                <div>
                  <p className="font-medium">{s.engagementTemplateId}</p>
                  <p className="text-xs text-foreground-muted capitalize">
                    {s.frequency} · day {s.triggerDay ?? '—'} at {s.triggerTime} · next {s.nextCreateAt?.slice(0, 10) ?? '—'}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(s)}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit schedule — {editing?.engagementTemplateId}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                />
                Active
              </label>
              <div>
                <Label>Trigger day</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={editing.triggerDay ?? ''}
                  onChange={(e) => setEditing({ ...editing, triggerDay: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Trigger time (server local time)</Label>
                <Input
                  type="time"
                  value={editing.triggerTime}
                  onChange={(e) => setEditing({ ...editing, triggerTime: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.autoSendDataRequestLetter}
                  onChange={(e) => setEditing({ ...editing, autoSendDataRequestLetter: e.target.checked })}
                />
                Auto-send data request letter
              </label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="button" onClick={() => void saveSchedule()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPageContainer>
  );
}
