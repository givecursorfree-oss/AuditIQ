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
import { notifyStopwatchChanged, STOPWATCH_CHANGED } from '@/lib/stopwatchEvents';

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
  engagement: { title: string; client: { name: string } };
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

export default function TimeTracker() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'today' | 'manual' | 'tasks'>('today');
  const [stopwatch, setStopwatch] = useState<Stopwatch | null>(null);
  const [tick, setTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [engagements, setEngagements] = useState<EngagementOption[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<{ type: string; message: string }[]>([]);
  const [workTypes, setWorkTypes] = useState<string[]>(WORK_TYPES_FALLBACK);
  const [showStartForm, setShowStartForm] = useState(() => searchParams.get('start') === '1');
  const [startForm, setStartForm] = useState({ engagementId: '', workType: 'Audit', notes: '' });

  // Manual log form
  const [loading, setLoading] = useState(true);
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    engagementId: '',
    workType: 'Audit',
    hours: 1,
    isBillable: true,
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
    try {
      await Promise.all([
        loadStopwatch(),
        api.get('/engagements?limit=100').then(r => setEngagements(r.data.engagements || [])).catch(() => null),
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
      const from = new Date(); from.setDate(from.getDate() - 7);
      const r = await api.get(`/time-entries?from=${from.toISOString()}`);
      setEntries(r.data);
    } catch { /* noop */ }
  }

  async function loadTasks() {
    try {
      const r = await api.get('/tasks?scope=mine');
      setTasks(r.data.filter((t: Task) => t.status !== 'Done' && t.status !== 'Cancelled'));
    } catch { /* noop */ }
  }

  async function loadReminders() {
    // Compose smart reminders: statutory deadlines T-7, gap notifications via dashboard
    try {
      const [dl, eng] = await Promise.all([
        api.get('/dashboard/deadlines').catch(() => ({ data: [] })),
        api.get('/engagements?status=Closed&limit=30').catch(() => ({ data: { engagements: [] } })),
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
    } catch { /* noop */ }
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

  // Tick the stopwatch every second
  useEffect(() => {
    if (!stopwatch) return;
    const i = setInterval(() => setTick(t => t + 1), 1000);
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
    return Math.round(logged + (stopwatch && !stopwatch.isPaused ? elapsedSeconds : 0));
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

  async function submitManual() {
    if (!manualForm.engagementId) {
      await appAlert({ title: 'Engagement required', message: 'Pick an engagement.' });
      return;
    }
    try {
      await api.post('/time-entries', {
        ...manualForm,
        date: new Date(manualForm.date).toISOString(),
        hours: Number(manualForm.hours),
      });
      setManualForm({ ...manualForm, hours: 1, description: '' });
      await loadEntries();
    } catch (e: any) {
      await appAlert({ title: 'Could not save', message: e?.response?.data?.error || 'Failed to save entry' });
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
      <PageHeader
        title="Time & tasks"
        description="Live stopwatch, manual time logs, and your daily to-do"
        actions={
          <div className="flex flex-wrap gap-2">
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
            <p className="text-xs text-muted-foreground text-center">
              Attendance is marked at login / on the Attendance page when you are at the office (GPS). Check out from Attendance at end of day — logging out of the app does not check you out.
            </p>
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
              <button type="button" className="btn-secondary" onClick={() => setShowStartForm(false)}>Cancel</button>
              <button type="button" className="btn-primary flex items-center gap-2" onClick={() => void startStopwatch()}>
                <Play size={16} weight="fill" /> Start
              </button>
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
            <table className="w-full text-sm">
              <thead><tr className="table-header text-left">
                <th className="px-4 py-3">Date</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Work Type</th><th className="px-4 py-3">Hours</th><th className="px-4 py-3">Billable</th>
              </tr></thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-2.5">{e.engagement.client.name}</td>
                    <td className="px-4 py-2.5">{e.workType || '—'}</td>
                    <td className="px-4 py-2.5">{e.hours.toFixed(2)}</td>
                    <td className="px-4 py-2.5">{e.isBillable ? '✓' : '—'}</td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No entries yet</td></tr>}
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
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <input type="date" aria-label="Date" className="input-field" value={manualForm.date} onChange={e => setManualForm({ ...manualForm, date: e.target.value })} />
            <select className="input-field sm:col-span-2" aria-label="Client or engagement" value={manualForm.engagementId} onChange={e => setManualForm({ ...manualForm, engagementId: e.target.value })}>
              <option value="">Client / Engagement…</option>
              {engagements.map(e => <option key={e.id} value={e.id}>{e.client.name} — {e.title}</option>)}
            </select>
            <select className="input-field" aria-label="Work type" value={manualForm.workType} onChange={e => setManualForm({ ...manualForm, workType: e.target.value })}>
              {workTypes.map(w => <option key={w}>{w}</option>)}
            </select>
            <input type="number" step={0.25} min={0.25} aria-label="Hours" className="input-field" value={manualForm.hours} onChange={e => setManualForm({ ...manualForm, hours: Number(e.target.value) })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={manualForm.isBillable} onChange={e => setManualForm({ ...manualForm, isBillable: e.target.checked })} />
              Billable
            </label>
          </div>
          <input className="input-field" aria-label="Notes or description" placeholder="Notes / description" value={manualForm.description} onChange={e => setManualForm({ ...manualForm, description: e.target.value })} />
          <button type="button" className="btn-primary" onClick={() => void submitManual()}>Add entry</button>

          <div className="mt-6">
            <h4 className="font-semibold text-foreground mb-2">Recent entries</h4>
            <table className="w-full text-sm">
              <thead><tr className="table-header text-left">
                <th className="px-4 py-3">Date</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Engagement</th><th className="px-4 py-3">Work Type</th><th className="px-4 py-3">Hours</th><th className="px-4 py-3">Billable</th>
              </tr></thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-2.5">{e.engagement.client.name}</td>
                    <td className="px-4 py-2.5 truncate max-w-xs">{e.engagement.title}</td>
                    <td className="px-4 py-2.5">{e.workType || '—'}</td>
                    <td className="px-4 py-2.5">{e.hours.toFixed(2)}</td>
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
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        onClick={() => void api.post('/stopwatch/start', {
                          engagementId: t.engagement!.id,
                          taskId: t.id,
                        }).then(() => setTab('today'))}
                      >
                        Start
                      </button>
                    )}
                    <button type="button" className="btn-secondary text-xs flex items-center gap-1" onClick={() => void completeTask(t.id)}>
                      <Check size={12} /> Done
                    </button>
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
