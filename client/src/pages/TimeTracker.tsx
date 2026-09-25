import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Plus, Calendar, ListChecks, BellRinging, Check } from '@phosphor-icons/react';
import api from '../services/api';
import { appAlert, appConfirm } from '../context/AppDialogContext';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { PanelCard } from '@/components/layout/PanelCard';
import { Button } from '@/components/ui/button';
import EngagementTimerWidget from '@/components/time/EngagementTimerWidget';
import PageLoading from '@/components/layout/PageLoading';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { notifyStopwatchChanged, STOPWATCH_CHANGED } from '@/lib/stopwatchEvents';
import { isEditableKeyboardTarget } from '@/lib/keyboard';
import { useAuth } from '@/context/AuthContext';

interface Stopwatch {
  id: string;
  engagementId: string;
  workType: string;
  startedAt: string;
  notes: string | null;
  isPaused?: boolean;
  elapsedSeconds?: number;
  engagement: { id: string; title: string; currentStage?: string; client: { id: string; name: string } } | null;
}

interface TimeEntry {
  id: string;
  date: string;
  hours: number;
  workType: string | null;
  description: string | null;
  isBillable: boolean;
  clientName?: string | null;
  compOff?: boolean;
  engagement: { title: string; client: { name: string } } | null;
  supervisor?: { id: string; firstName: string; lastName: string } | null;
  user?: { firstName: string; lastName: string; initials: string };
}

interface GridClient {
  name: string;
  engagements: { id: string; title: string }[];
}

interface SupervisorOption {
  id: string;
  name: string;
  role: string;
}

interface EngagementOption {
  id: string;
  title: string;
  client: { name: string };
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  engagement?: { id: string; title: string; client: { name: string } } | null;
}

const WORK_TYPES_FALLBACK = ['Audit', 'GST Filing', 'IT Filing', 'Consultation', 'Internal', 'Other'];
const HOUR_CHOICES = Array.from({ length: 24 }, (_, i) => (i + 1) * 0.5);

function entryClientName(entry: TimeEntry): string {
  return entry.clientName || entry.engagement?.client?.name || '—';
}

function entryManagerName(entry: TimeEntry): string {
  if (!entry.supervisor) return '—';
  return `${entry.supervisor.firstName} ${entry.supervisor.lastName}`.trim();
}

export default function TimeTracker() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'today' | 'manual' | 'tasks'>('today');
  const [stopwatch, setStopwatch] = useState<Stopwatch | null>(null);
  const [tick, setTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [engagements, setEngagements] = useState<EngagementOption[]>([]);
  const [gridClients, setGridClients] = useState<GridClient[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<{ type: string; message: string }[]>([]);
  const [workTypes, setWorkTypes] = useState<string[]>(WORK_TYPES_FALLBACK);
  const [showStartForm, setShowStartForm] = useState(() => searchParams.get('start') === '1');
  const [startForm, setStartForm] = useState({ engagementId: '', workType: 'Audit', notes: '' });

  // Manual log form
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    clientName: '',
    engagementId: '',
    supervisorId: '',
    workType: 'Audit',
    hours: 1,
    isBillable: true,
    compOff: false,
    description: '',
  });

  async function loadStopwatch() {
    try {
      const r = await api.get('/stopwatch/current');
      setStopwatch(r.data);
    } catch { setStopwatch(null); }
  }

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([
        loadStopwatch(),
        api.get<{ clients: GridClient[]; supervisors: SupervisorOption[] }>('/time-entries/meta/grid').then((r) => {
          const clients = r.data.clients || [];
          setGridClients(clients);
          setSupervisors(r.data.supervisors || []);
          setEngagements(
            clients.flatMap((client) =>
              client.engagements.map((engagement) => ({
                id: engagement.id,
                title: engagement.title,
                client: { name: client.name },
              }))
            )
          );
        }).catch(() => null),
        api.get<{ workTypes: string[] }>('/time-entries/meta/vocab').then((r) => {
          if (r.data.workTypes?.length) {
            setWorkTypes(r.data.workTypes);
            setStartForm((f) => ({
              ...f,
              workType: r.data.workTypes.includes(f.workType) ? f.workType : r.data.workTypes[0],
            }));
            setManualForm((f) => ({
              ...f,
              workType: r.data.workTypes.includes(f.workType) ? f.workType : r.data.workTypes[0],
            }));
          }
        }).catch(() => null),
        loadEntries(),
        loadTasks(),
        loadReminders(),
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadEntries() {
    try {
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const r = await api.get('/time-entries', {
        params: {
          from: from.toISOString(),
          ...(user?.id ? { userId: user.id } : {}),
        },
      });
      setEntries(Array.isArray(r.data) ? r.data : []);
    } catch {
      setLoadError('Failed to load time entries.');
    }
  }

  async function loadTasks() {
    try {
      const r = await api.get('/tasks', { params: { scope: 'mine' } });
      const raw = r.data;
      const list: Task[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.tasks)
          ? raw.tasks
          : [];
      setTasks(
        list.filter((t) => {
          const s = String(t.status || '');
          return s !== 'Done' && s !== 'Cancelled' && s !== 'completed';
        })
      );
    } catch {
      setTasks([]);
    }
  }

  async function loadReminders() {
    // Optional niceties — never fail the page if deadlines/UDIN checks error
    try {
      const [dl, eng] = await Promise.all([
        api.get('/dashboard/deadlines').catch(() => ({ data: [] as { title: string; dueDate: string }[] })),
        api.get('/engagements?status=Closed&limit=30').catch(() => ({ data: { engagements: [] as { title: string; udin?: string | null }[] } })),
      ]);
      const rems: { type: string; message: string }[] = [];
      for (const d of dl.data || []) {
        const days = Math.ceil((new Date(d.dueDate).getTime() - Date.now()) / 86400000);
        if (days >= 0 && days <= 7) rems.push({ type: 'deadline', message: `${d.title} due in ${days} day(s)` });
      }
      for (const e of eng.data?.engagements || []) {
        if (!e.udin) rems.push({ type: 'udin', message: `UDIN not generated for ${e.title}` });
      }
      setReminders(rems);
    } catch {
      setReminders([]);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  // After attendance check-in / resume: open engagement picker once
  useEffect(() => {
    if (searchParams.get('start') !== '1') return;
    setShowStartForm(true);
    setTab('today');
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const i = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const onStopwatchChanged = () => void loadStopwatch();
    window.addEventListener(STOPWATCH_CHANGED, onStopwatchChanged);
    return () => window.removeEventListener(STOPWATCH_CHANGED, onStopwatchChanged);
  }, []);

  // Tick only while running — paused display uses frozen elapsedSeconds from API.
  useEffect(() => {
    if (!stopwatch || stopwatch.isPaused) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [stopwatch]);

  const elapsedSeconds = useMemo(() => {
    if (!stopwatch) return 0;
    if (stopwatch.elapsedSeconds != null && stopwatch.isPaused) return stopwatch.elapsedSeconds;
    return Math.max(0, Math.floor((Date.now() - new Date(stopwatch.startedAt).getTime()) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopwatch, tick]);

  const dayTotalSeconds = useMemo(() => {
    const today = new Date().toDateString();
    const logged = entries
      .filter((e) => new Date(e.date).toDateString() === today)
      .reduce((s, e) => s + e.hours * 3600, 0);
    // Include live or paused session — paused time still counts toward today.
    return Math.round(logged + (stopwatch ? elapsedSeconds : 0));
  }, [entries, stopwatch, elapsedSeconds]);

  async function startStopwatch() {
    if (!startForm.engagementId) {
      await appAlert({ title: 'Engagement required', message: 'Pick an engagement to start the timer.' });
      return;
    }
    try {
      await api.post('/stopwatch/start', startForm);
      setShowStartForm(false);
      await loadStopwatch();
      notifyStopwatchChanged();
      window.dispatchEvent(new Event('auditiq:clock-in'));
    } catch (e: any) {
      await appAlert({ title: 'Could not start', message: e?.response?.data?.error || 'Failed to start' });
    }
  }

  async function pauseStopwatch() {
    try {
      await api.post('/stopwatch/pause');
      await loadStopwatch();
      notifyStopwatchChanged();
    } catch (e: any) {
      await appAlert({ title: 'Could not pause', message: e?.response?.data?.error || 'Failed to pause' });
    }
  }

  async function resumeStopwatch() {
    try {
      await api.post('/stopwatch/resume');
      await loadStopwatch();
      notifyStopwatchChanged();
    } catch (e: any) {
      await appAlert({ title: 'Could not resume', message: e?.response?.data?.error || 'Failed to resume' });
    }
  }

  // Space toggles pause/resume when a timer is active and focus is not in a field.
  useEffect(() => {
    if (!stopwatch) return;
    const paused = Boolean(stopwatch.isPaused);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== ' ' && e.code !== 'Space') return;
      if (isEditableKeyboardTarget(e.target)) return;
      e.preventDefault();
      if (paused) {
        void api
          .post('/stopwatch/resume')
          .then(() => loadStopwatch())
          .then(() => notifyStopwatchChanged())
          .catch(async (err: unknown) => {
            const msg =
              err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
                : undefined;
            await appAlert({ title: 'Could not resume', message: msg || 'Failed to resume' });
          });
      } else {
        void api
          .post('/stopwatch/pause')
          .then(() => loadStopwatch())
          .then(() => notifyStopwatchChanged())
          .catch(async (err: unknown) => {
            const msg =
              err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
                : undefined;
            await appAlert({ title: 'Could not pause', message: msg || 'Failed to pause' });
          });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stopwatch?.id, stopwatch?.isPaused]);

  async function stopStopwatch() {
    const ok = await appConfirm({
      title: 'Stop timer',
      message: 'Stop the timer and log this time?',
      confirmLabel: 'Stop & log',
    });
    if (!ok) return;
    try {
      const r = await api.post('/stopwatch/stop', {});
      setStopwatch(null);
      notifyStopwatchChanged();
      await loadEntries();
      await appAlert({
        title: 'Time logged',
        message: `Logged ${r.data.hoursLogged}h (${Math.round(r.data.secondsTracked / 60)} min tracked)`,
      });
    } catch (e: any) {
      await appAlert({ title: 'Could not stop', message: e?.response?.data?.error || 'Failed to stop' });
    }
  }

  async function cancelStopwatch() {
    const ok = await appConfirm({
      title: 'Discard timer',
      message: 'Discard this timer without logging?',
      destructive: true,
      confirmLabel: 'Discard',
    });
    if (!ok) return;
    try {
      await api.post('/stopwatch/cancel', {});
      setStopwatch(null);
      notifyStopwatchChanged();
    } catch (e: any) {
      await appAlert({ title: 'Could not discard', message: e?.response?.data?.error || 'Failed to discard timer' });
    }
  }

  const clientEngagements = useMemo(() => {
    const key = manualForm.clientName.trim().toLowerCase();
    if (!key) return [];
    return gridClients.find((client) => client.name.trim().toLowerCase() === key)?.engagements ?? [];
  }, [gridClients, manualForm.clientName]);

  async function submitManual() {
    if (!manualForm.clientName.trim()) {
      await appAlert({ title: 'Client required', message: 'Select a client.' });
      return;
    }
    if (!manualForm.supervisorId) {
      await appAlert({ title: 'Manager required', message: 'Select a manager or partner.' });
      return;
    }
    if (!manualForm.hours || manualForm.hours < 0.25) {
      await appAlert({ title: 'Hours required', message: 'Select the number of hours.' });
      return;
    }
    try {
      await api.post('/time-entries', {
        date: new Date(manualForm.date).toISOString(),
        hours: Number(manualForm.hours),
        workType: manualForm.workType,
        description: manualForm.description,
        isBillable: manualForm.isBillable,
        compOff: manualForm.compOff,
        clientName: manualForm.clientName.trim(),
        supervisorId: manualForm.supervisorId,
        ...(manualForm.engagementId ? { engagementId: manualForm.engagementId } : {}),
      });
      setManualForm({ ...manualForm, description: '' });
      await loadEntries();
    } catch (e: any) {
      const raw = e?.response?.data?.error;
      const message = typeof raw === 'string' ? raw : 'Failed to save entry';
      await appAlert({ title: 'Could not save', message });
    }
  }

  async function completeTask(id: string) {
    try {
      await api.patch(`/tasks/${id}`, { status: 'Done' });
      await loadTasks();
    } catch (e: any) {
      await appAlert({ title: 'Could not update', message: e?.response?.data?.error || 'Failed to complete task' });
    }
  }

  if (loading) {
    return <PageLoading className="h-64" />;
  }

  return (
    <AppPageContainer className="space-y-6">
      {loadError && <ErrorBanner message={loadError} onRetry={() => void loadAll()} />}
      <PageHeader
        title="Time tracker"
        description="Stopwatch, manual logs, and tasks"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/attendance')}>
              Attendance
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/timesheets')}>
              Timesheets
            </Button>
            {reminders.length > 0 ? (
              <Button type="button" size="sm" variant="outline" className="text-warning border-warning/30" onClick={() => setTab('today')}>
                <BellRinging size={16} className="mr-1" />
                {reminders.length} reminder{reminders.length > 1 ? 's' : ''}
              </Button>
            ) : null}
          </div>
        }
      />

      <PanelCard title="Stopwatch">
        {!stopwatch && !showStartForm ? (
          <div className="flex flex-col items-center gap-4">
            <EngagementTimerWidget
              engagementName=""
              engagementStage=""
              elapsedSeconds={0}
              dayTotalSeconds={dayTotalSeconds}
              isRunning={false}
              isPaused={false}
              onStart={() => setShowStartForm(true)}
              onPause={() => {}}
              onResume={() => {}}
              onStop={() => {}}
            />
          </div>
        ) : showStartForm && !stopwatch ? (
          <div className="space-y-3 max-w-lg mx-auto">
            <h3 className="font-semibold text-foreground text-center">Start client stopwatch</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select className="input-field" aria-label="Engagement" value={startForm.engagementId} onChange={e => setStartForm({ ...startForm, engagementId: e.target.value })}>
                <option value="">Select engagement…</option>
                {engagements.map(e => <option key={e.id} value={e.id}>{e.client.name} — {e.title}</option>)}
              </select>
              <select className="input-field" aria-label="Work type" value={startForm.workType} onChange={e => setStartForm({ ...startForm, workType: e.target.value })}>
                {workTypes.map(w => <option key={w}>{w}</option>)}
              </select>
              <input className="input-field" aria-label="Notes" placeholder="Notes (optional)" value={startForm.notes} onChange={e => setStartForm({ ...startForm, notes: e.target.value })} />
            </div>
            <div className="flex justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowStartForm(false)}>Cancel</Button>
              <Button type="button" size="sm" className="gap-2" onClick={() => void startStopwatch()}>
                <Play size={16} weight="fill" /> Start
              </Button>
            </div>
          </div>
        ) : stopwatch ? (
          <EngagementTimerWidget
            engagementName={
              stopwatch.engagement
                ? `${stopwatch.engagement.client.name} — ${stopwatch.engagement.title}`
                : ''
            }
            engagementStage={stopwatch.engagement?.currentStage ?? stopwatch.workType}
            elapsedSeconds={elapsedSeconds}
            dayTotalSeconds={dayTotalSeconds}
            isRunning={!stopwatch.isPaused}
            isPaused={Boolean(stopwatch.isPaused)}
            onStart={() => void resumeStopwatch()}
            onPause={() => void pauseStopwatch()}
            onResume={() => void resumeStopwatch()}
            onStop={() => void stopStopwatch()}
          />
        ) : null}
        {stopwatch && (
          <div className="flex justify-center mt-3">
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => void cancelStopwatch()}>
              Discard without saving
            </button>
          </div>
        )}
      </PanelCard>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {(['today', 'manual', 'tasks'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t ? 'tab-active' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'today' ? "Today's Dashboard" : t === 'manual' ? 'Manual time grid' : 'My tasks'}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Calendar size={18} /> Recent time logs (7 days)</h3>
            <table className="w-full text-sm table-fixed">
              <thead><tr className="table-header text-left">
                <th className="w-[12%] px-3 py-3">Date</th>
                <th className="w-[18%] px-3 py-3">User</th>
                <th className="w-[28%] px-3 py-3">Client</th>
                <th className="w-[24%] px-3 py-3">Work Type</th>
                <th className="w-[10%] px-3 py-3 text-right">Hours</th>
                <th className="w-[8%] px-3 py-3 text-right">Billable</th>
              </tr></thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 whitespace-nowrap">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-2.5 truncate">
                      {e.user ? `${e.user.firstName} ${e.user.lastName}` : user ? `${user.firstName} ${user.lastName}` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="truncate font-medium">{entryClientName(e)}</div>
                      {e.engagement?.title ? (
                        <div className="truncate text-xs text-muted-foreground">{e.engagement.title}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 truncate">{e.workType || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{Number(e.hours).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right">{e.isBillable ? '✓' : '—'}</td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No entries yet</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2"><BellRinging size={18} /> Smart reminders</h3>
            <div className="space-y-2">
              {reminders.map((r) => (
                <div key={`${r.type}:${r.message}`} className="p-2 rounded bg-warning/10 border border-warning/30 text-sm text-foreground">
                  {r.message}
                </div>
              ))}
              {reminders.length === 0 && <div className="text-sm text-muted-foreground">All caught up.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'manual' && (
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><Plus size={18} /> Add time entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Date</span>
              <input type="date" aria-label="Date" className="input-field mt-1" value={manualForm.date} onChange={e => setManualForm({ ...manualForm, date: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Client</span>
              <input
                className="input-field mt-1"
                aria-label="Client"
                list="manual-time-clients"
                value={manualForm.clientName}
                onChange={(e) => setManualForm({ ...manualForm, clientName: e.target.value, engagementId: '' })}
              />
              <datalist id="manual-time-clients">
                {gridClients.map((client) => (
                  <option key={client.name} value={client.name} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Engagement</span>
              <select
                className="input-field mt-1"
                aria-label="Engagement"
                value={manualForm.engagementId}
                onChange={(e) => setManualForm({ ...manualForm, engagementId: e.target.value })}
              >
                <option value="">—</option>
                {clientEngagements.map((engagement) => (
                  <option key={engagement.id} value={engagement.id}>{engagement.title}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Activity</span>
              <select className="input-field mt-1" aria-label="Work type" value={manualForm.workType} onChange={e => setManualForm({ ...manualForm, workType: e.target.value })}>
                {workTypes.map(w => <option key={w}>{w}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Manager / Partner</span>
              <select
                className="input-field mt-1"
                aria-label="Manager or partner"
                value={manualForm.supervisorId}
                onChange={(e) => setManualForm({ ...manualForm, supervisorId: e.target.value })}
              >
                <option value="">—</option>
                {supervisors.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Hours</span>
              <select
                className="input-field mt-1"
                aria-label="Hours"
                value={String(manualForm.hours)}
                onChange={(e) => setManualForm({ ...manualForm, hours: Number(e.target.value) })}
              >
                {HOUR_CHOICES.map((hours) => (
                  <option key={hours} value={hours}>{hours.toFixed(hours % 1 === 0 ? 0 : 1)}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm mt-5">
              <input type="checkbox" checked={manualForm.isBillable} onChange={e => setManualForm({ ...manualForm, isBillable: e.target.checked })} />
              Billable
            </label>
            <label className="flex items-center gap-2 text-sm mt-5">
              <input type="checkbox" checked={manualForm.compOff} onChange={e => setManualForm({ ...manualForm, compOff: e.target.checked })} />
              Comp off
            </label>
          </div>
          <input className="input-field" aria-label="Notes or description" placeholder="Notes / description" value={manualForm.description} onChange={e => setManualForm({ ...manualForm, description: e.target.value })} />
          <Button type="button" size="sm" onClick={() => void submitManual()}>Add entry</Button>

          <div className="mt-6">
            <h4 className="font-semibold text-foreground mb-2">Recent entries</h4>
            <table className="w-full text-sm">
              <thead><tr className="table-header text-left">
                <th className="px-4 py-3">Date</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Engagement</th><th className="px-4 py-3">Work Type</th><th className="px-4 py-3">Manager / Partner</th><th className="px-4 py-3">Hours</th><th className="px-4 py-3">Billable</th>
              </tr></thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-2.5">{entryClientName(e)}</td>
                    <td className="px-4 py-2.5 truncate max-w-xs">{e.engagement?.title ?? '—'}</td>
                    <td className="px-4 py-2.5">{e.workType || '—'}</td>
                    <td className="px-4 py-2.5">{entryManagerName(e)}</td>
                    <td className="px-4 py-2.5">{Number(e.hours).toFixed(2)}</td>
                    <td className="px-4 py-2.5">{e.isBillable ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card p-4">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2"><ListChecks size={18} /> My open tasks</h3>
          <div className="space-y-2">
            {tasks.map(t => {
              const days = t.dueDate ? Math.ceil((new Date(t.dueDate).getTime() - nowMs) / 86400000) : null;
              const rag = days == null ? '' : days < 3 ? 'text-danger' : days < 7 ? 'text-warning' : 'text-success';
              return (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-md bg-surface-muted">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{t.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        t.priority === 'Urgent' ? 'bg-danger/20 text-danger' :
                        t.priority === 'High' ? 'bg-warning/20 text-warning' :
                        'bg-foreground-muted/10 text-muted-foreground'
                      }`}>{t.priority}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.engagement && <>{t.engagement.client.name} · {t.engagement.title}</>}
                      {days != null && <span className={`ml-2 ${rag}`}>· Due in {days} day(s)</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.engagement && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          void (async () => {
                            try {
                              await api.post('/stopwatch/start', {
                                engagementId: t.engagement!.id,
                                taskId: t.id,
                                workType: startForm.workType || 'Audit',
                              });
                              await loadStopwatch();
                              notifyStopwatchChanged();
                              window.dispatchEvent(new Event('auditiq:clock-in'));
                              setTab('today');
                            } catch (e: unknown) {
                              const msg =
                                e && typeof e === 'object' && 'response' in e
                                  ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
                                  : undefined;
                              await appAlert({ title: 'Could not start', message: msg || 'Failed to start' });
                            }
                          })();
                        }}
                      >
                        Start
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void completeTask(t.id)}>
                      <Check size={12} /> Done
                    </Button>
                  </div>
                </div>
              );
            })}
            {tasks.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No open tasks</div>}
          </div>
        </div>
      )}
    </AppPageContainer>
  );
}
