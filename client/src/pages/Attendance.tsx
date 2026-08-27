import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock, MapPin, Calendar, CheckCircle as CheckCircle2, XCircle, SignIn as LogIn, SignOut as LogOut,
  MagnifyingGlass as Search, CaretLeft as ChevronLeft, CaretRight as ChevronRight, Plus, X, WarningCircle as AlertCircle
} from '@phosphor-icons/react';
import api from '../services/api';
import type { Attendance, LeaveRequest } from '../types';
import { useAuth } from '../context/AuthContext';
import { tryAttendanceCheckIn, tryAttendanceResume, requestAttendanceLocation, type PlaceOfWork } from '../lib/attendancePopup';
import { hoursBetween } from '../lib/attendanceDates';
import { attendanceDayState } from '../lib/attendanceDayGate';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import { PanelCard, MetricCard } from '../components/layout/PanelCard';
import { ApprovalStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { Button } from '@/components/ui/button';
import { attendanceLoginNotice } from '../lib/attendanceLoginNotice';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { appToast, gooeyToast } from '@/context/AppToastContext';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
/** Must match server leaveCreateSchema */
const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Holiday', 'Exam', 'Study'] as const;
const PLACES: PlaceOfWork[] = ['Office', 'Client Place', 'Work from Home'];

export default function AttendancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'attendance' | 'leaves'>('attendance');
  const [records, setRecords] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null);
  const [isArticle, setIsArticle] = useState(false);
  const [placeOfWork, setPlaceOfWork] = useState<PlaceOfWork>('Office');
  const [clientName, setClientName] = useState('');
  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });
  const curMonth = calendarMonth.month;
  const curYear = calendarMonth.year;
  const [summary, setSummary] = useState<{
    totalDays: number;
    totalHours: number;
    presentDays: number;
    lateDays: number;
    articlePolicy?: {
      softLateCount: number;
      hardLateCount: number;
      noAttdCount: number;
      lateDebitDays: number;
      noAttdDebitDays: number;
      totalDebitDays: number;
    } | null;
  } | null>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', type: 'Casual', reason: '' });
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [todayLabel, setTodayLabel] = useState('');

  useEffect(() => {
    setTodayLabel(
      new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    );
  }, []);

  const loadTodayRecord = async () => {
    const { data } = await api.get<Attendance | null>('/attendance/me/today');
    setTodayRecord(data);
    if (data?.isArticle != null) setIsArticle(!!data.isArticle);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [attRes, leavesRes, summaryRes, balanceRes] = await Promise.all([
        api.get<Attendance[]>('/attendance'),
        api.get<LeaveRequest[]>('/attendance/leaves'),
        api.get(`/attendance/summary?month=${curYear}-${String(curMonth).padStart(2, '0')}`),
        api
          .get<{ isArticle?: boolean }>('/attendance/leaves/balance')
          .catch(() => ({ data: { isArticle: false } as { isArticle?: boolean } })),
      ]);
      setRecords(attRes.data);
      setLeaves(leavesRes.data);
      setSummary(summaryRes.data);
      if (balanceRes.data?.isArticle) setIsArticle(true);
      await loadTodayRecord();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not load attendance. Please refresh.';
      await appAlert(msg);
    } finally {
      setLoading(false);
    }
  }, [curMonth, curYear]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    void api
      .get<{ values: string[] }>('/hr-masters/lookups?kind=attendance_client')
      .then((r) => setClientOptions(r.data.values || []))
      .catch(() => setClientOptions([]));
  }, []);

  const handleCheckIn = async () => {
    if (!user?.id) return;
    if (placeOfWork === 'Client Place' && !clientName.trim()) {
      await appAlert('Enter or select the client name for Client Place check-in.');
      return;
    }
    setCheckingIn(true);
    let loadingId: string | number | undefined;
    try {
      let gps: { latitude?: number; longitude?: number; accuracyMeters?: number } = {};
      if (placeOfWork === 'Office') {
        const fix = await requestAttendanceLocation({ confirm: appConfirm });
        gps = {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracyMeters: fix.accuracyMeters,
        };
        loadingId = gooeyToast.info('Checking location…', {
          description: 'Verifying your location at the office.',
          timing: { displayDuration: 2_147_483_647 },
          showTimestamp: false,
        });
      } else {
        loadingId = gooeyToast.info('Checking attendance…', {
          description:
            placeOfWork === 'Work from Home'
              ? isArticle
                ? 'WFH requires prior manager approval.'
                : 'Recording Work from Home attendance.'
              : 'Recording Client Place attendance.',
          timing: { displayDuration: 2_147_483_647 },
          showTimestamp: false,
        });
      }
      await tryAttendanceCheckIn(user.id, 'manual', {
        skipIfAlreadyDone: true,
        forcePopup: false,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracyMeters: gps.accuracyMeters,
        gpsAttempted: placeOfWork === 'Office',
        placeOfWork,
        clientName: placeOfWork === 'Client Place' ? clientName.trim() : undefined,
      });
      if (loadingId != null) gooeyToast.dismiss(loadingId);
      gooeyToast.dismiss();
      appToast({
        variant: 'success',
        title: 'Attendance marked',
        message:
          placeOfWork === 'Office'
            ? 'You are checked in. Select an engagement to start.'
            : `Checked in · ${placeOfWork}. Select an engagement to start.`,
        durationMs: 3500,
      });
      await fetchAll();
      navigate('/time-tracker?start=1');
    } catch (err: unknown) {
      if (loadingId != null) gooeyToast.dismiss(loadingId);
      const notice = attendanceLoginNotice(err);
      appToast({
        persist: true,
        variant: notice.variant,
        title: notice.title,
        message: notice.message,
      });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleResumeDay = async () => {
    const ok = await appConfirm({
      title: 'Resume day?',
      message:
        'Clears today’s check-out so you can keep working. Original check-in time stays the same.',
      confirmLabel: 'Resume day',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setCheckingIn(true);
    try {
      const resumed = await tryAttendanceResume();
      if (!resumed) {
        await appAlert('Could not resume day. Please try again.');
        return;
      }
      appToast({
        variant: 'success',
        title: 'Day resumed',
        message: 'Select an engagement and start your timer.',
      });
      await fetchAll();
      navigate('/time-tracker?start=1');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    const ok = await appConfirm({
      title: 'End day (check out)?',
      message:
        'This closes attendance for today. Logging out of the app does not check you out. If you check out by mistake, use Resume day.',
      confirmLabel: 'End day',
      cancelLabel: 'Keep working',
    });
    if (!ok) return;
    setCheckingIn(true);
    try {
      const { data } = await api.post<Attendance & { hoursWorked?: number }>('/attendance/check-out');
      setTodayRecord({
        ...data,
        hoursWorked: data.hoursWorked ?? hoursBetween(data.checkIn, data.checkOut) ?? undefined,
      });
      await fetchAll();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Check-out failed. Please try again.';
      await appAlert(msg);
    } finally {
      setCheckingIn(false);
    }
  };

  const handleSubmitLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate) return;
    setSubmittingLeave(true);
    try {
      await api.post('/attendance/leaves', leaveForm);
      setShowLeaveForm(false);
      setLeaveForm({ startDate: '', endDate: '', type: 'Casual', reason: '' });
      await appAlert({ title: 'Leave submitted', message: 'Your leave request was sent for approval.' });
      await fetchAll();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not submit leave request.';
      await appAlert(msg);
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleApproveLeave = async (id: string, action: 'approve' | 'reject') => {
    const role = user?.role || '';
    let status: string;
    if (action === 'reject') {
      status = 'Rejected';
    } else if (['Partner', 'Admin', 'HR'].includes(role)) {
      status = 'Approved';
    } else {
      status = 'Manager Approved';
    }
    try {
      await api.patch(`/attendance/leaves/${id}`, { status });
      await fetchAll();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not update leave request.';
      await appAlert(msg);
    }
  };

  const dayState = attendanceDayState(todayRecord);

  const prevMonth = () => {
    setCalendarMonth(({ month, year }) =>
      month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
    );
  };
  const nextMonth = () => {
    setCalendarMonth(({ month, year }) =>
      month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
    );
  };

  return (
    <AppPageContainer className="space-y-6">
      <PageHeader
        title="Attendance"
        description={`${MONTHS[curMonth - 1]} ${curYear}`}
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft size={16} />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={nextMonth} aria-label="Next month">
              <ChevronRight size={16} />
            </Button>
          </div>
        }
      />

      <PanelCard
        title="Today"
        action={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/leave-stipend">
              <Plus size={16} className="mr-1" /> Apply leave
            </Link>
          </Button>
        }
      >
        <p className="mb-2 text-sm text-muted-foreground">
          {todayLabel || '\u00a0'}
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {dayState === 'none' && (
            <Button type="button" size="default" disabled={checkingIn} onClick={() => void handleCheckIn()}>
              <LogIn size={16} className="mr-1" /> {checkingIn ? 'Processing…' : 'Check in'}
            </Button>
          )}
          {dayState === 'open' && (
            <Button
              type="button"
              size="default"
              variant="destructive"
              disabled={checkingIn}
              onClick={() => void handleCheckOut()}
            >
              <LogOut size={16} className="mr-1" /> {checkingIn ? 'Processing…' : 'End day (check out)'}
            </Button>
          )}
          {dayState === 'closed' && (
            <>
              <ApprovalStatusBadge status="Approved" />
              <Button type="button" size="default" disabled={checkingIn} onClick={() => void handleResumeDay()}>
                <LogIn size={16} className="mr-1" /> {checkingIn ? 'Processing…' : 'Resume day'}
              </Button>
            </>
          )}
        </div>
        {dayState === 'open' && (
          <p className="mb-3 text-xs text-muted-foreground">
            Day is open. Use <strong>End day (check out)</strong> when you finish work. Logging out of the app does not
            check you out.
          </p>
        )}
        {dayState === 'closed' && (
          <p className="mb-3 text-xs text-muted-foreground">
            Day ended. Use <strong>Resume day</strong> if you checked out by mistake and still need to work.
          </p>
        )}

        {!todayRecord && (
          <div className="mb-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="text-sm w-full sm:w-auto">
                <span className="mb-1 block text-muted-foreground">Place of work</span>
                <select
                  className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:min-h-0 sm:w-auto sm:py-1.5 sm:text-sm"
                  value={placeOfWork}
                  onChange={(e) => setPlaceOfWork(e.target.value as PlaceOfWork)}
                >
                  {PLACES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              {placeOfWork === 'Client Place' && (
                <label className="text-sm w-full sm:min-w-[220px]">
                  <span className="mb-1 block text-muted-foreground">Client name</span>
                  <input
                    className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:min-h-0 sm:py-1.5 sm:text-sm"
                    list="attendance-client-names"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Select or type client name"
                    autoComplete="organization"
                  />
                  <datalist id="attendance-client-names">
                    {clientOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
              )}
            </div>
            {placeOfWork === 'Work from Home' && (
              <p className="text-xs text-muted-foreground">
                {isArticle
                  ? 'Manager must approve WFH for today before you can check in.'
                  : 'Marking attendance as Work from Home.'}
              </p>
            )}
            {placeOfWork === 'Office' && (
              <p className="text-xs text-muted-foreground">
                Office check-in uses your phone GPS coordinates against the office pin (not Wi‑Fi/IP). Works on mobile browsers over HTTPS.
              </p>
            )}
            {placeOfWork === 'Client Place' && (
              <p className="text-xs text-muted-foreground">
                Select or type the client name where you are working today.
              </p>
            )}
          </div>
        )}
        {todayRecord ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1 text-sm text-foreground">
              <LogIn size={14} className="text-success" />
              {todayRecord.checkIn ? new Date(todayRecord.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </span>
            {todayRecord.location && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin size={14} />
                {todayRecord.location}
                {todayRecord.clientName ? ` · ${todayRecord.clientName}` : ''}
              </span>
            )}
            {todayRecord.lateBand && todayRecord.lateBand !== 'on_time' && (
              <span className="text-sm text-warning">
                {todayRecord.lateBand === 'soft_late' ? 'Late (10:06–10:35)' : 'Late (after 10:35)'}
              </span>
            )}
            {dayState === 'closed' && todayRecord?.checkOut && (
              <span className="flex items-center gap-1 text-sm text-foreground">
                <LogOut size={14} className="text-danger" />
                {new Date(todayRecord.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {(todayRecord.hoursWorked != null || dayState === 'closed') && (
              <span className="text-sm text-muted-foreground">
                {Number(todayRecord.hoursWorked ?? hoursBetween(todayRecord.checkIn, todayRecord.checkOut) ?? 0).toFixed(1)} hrs
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {placeOfWork === 'Office'
              ? 'Not checked in. Use your phone GPS (Precise Location) at the office. Wi‑Fi/IP location is not accepted.'
              : placeOfWork === 'Work from Home'
                ? isArticle
                  ? 'Not checked in. WFH needs manager approval for today.'
                  : 'Not checked in. Select Work from Home, then check in.'
                : 'Not checked in. Select or enter client name, then check in.'}
          </p>
        )}
      </PanelCard>

      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard title="Days present" value={summary.presentDays ?? summary.totalDays} />
          <MetricCard
            title="Avg hours/day"
            value={summary.totalHours && summary.presentDays ? (summary.totalHours / summary.presentDays).toFixed(1) : '0'}
          />
          {summary.articlePolicy && (
            <>
              <MetricCard title="Late debit (days)" value={summary.articlePolicy.lateDebitDays} />
              <MetricCard title="No-attd debit (days)" value={summary.articlePolicy.noAttdDebitDays} />
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
          <button type="button" onClick={() => setTab('attendance')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'attendance' ? 'bg-card-hover text-foreground' : 'text-muted-foreground hover:text-foreground-secondary'}`}>Records</button>
          <button type="button" onClick={() => setTab('leaves')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'leaves' ? 'bg-card-hover text-foreground' : 'text-muted-foreground hover:text-foreground-secondary'}`}>Leave Requests</button>
        </div>
        {tab === 'leaves' && (
          <button type="button" onClick={() => setShowLeaveForm(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={14} /> Apply Leave
          </button>
        )}
      </div>

      {/* Leave Request Form Modal */}
      {showLeaveForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Apply for Leave</h3>
              <button type="button" onClick={() => setShowLeaveForm(false)} className="p-1 rounded hover:bg-hover-bg"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="leave-type" className="block text-sm text-muted-foreground mb-1">Leave Type</label>
                <select id="leave-type" aria-label="Leave Type" value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })} className="input w-full">
                  {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="stat-grid-2">
                <div>
                  <label htmlFor="leave-from-date" className="block text-sm text-muted-foreground mb-1">From</label>
                  <input id="leave-from-date" type="date" aria-label="From" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="input w-full" />
                </div>
                <div>
                  <label htmlFor="leave-to-date" className="block text-sm text-muted-foreground mb-1">To</label>
                  <input id="leave-to-date" type="date" aria-label="To" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="input w-full" />
                </div>
              </div>
              <div>
                <label htmlFor="leave-reason" className="block text-sm text-muted-foreground mb-1">Reason</label>
                <textarea id="leave-reason" aria-label="Reason" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="input w-full" rows={3} placeholder="Optional reason..." />
              </div>
              {leaveForm.startDate && leaveForm.endDate && (
                <p className="text-xs text-muted-foreground">
                  Duration: {Math.max(1, Math.ceil((new Date(leaveForm.endDate).getTime() - new Date(leaveForm.startDate).getTime()) / (1000*60*60*24)) + 1)} day(s)
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowLeaveForm(false)} className="btn-secondary text-sm">Cancel</button>
                <button type="button" onClick={handleSubmitLeave} disabled={submittingLeave || !leaveForm.startDate || !leaveForm.endDate} className="btn-primary text-sm disabled:opacity-50">
                  {submittingLeave ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'attendance' ? (
        <div className="space-y-1">
          {records.map(r => (
            <div key={r.id} className="card flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="icon-well-sm">
                  <Clock size={14} />
                </div>
                <div>
                  <p className="text-sm text-foreground">{r.date ? new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.user
                      ? `${r.user.firstName} ${r.user.lastName}`
                      : r.method || 'manual'}
                    {r.user && (r.location || r.clientName)
                      ? ` · ${r.location || ''}${r.clientName ? ` · ${r.clientName}` : ''}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-muted-foreground">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span className="text-muted-foreground w-14 text-right">
                  {r.hoursWorked != null
                    ? Number(r.hoursWorked).toFixed(1)
                    : hoursBetween(r.checkIn, r.checkOut)?.toFixed(1) ?? '—'}{' '}
                  h
                </span>
              </div>
            </div>
          ))}
          {records.length === 0 && <p className="text-center text-muted-foreground py-8">No attendance records this month</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {leaves.map(l => (
            <div key={l.id} className="card flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-foreground font-medium">{l.type} Leave</p>
                  {(l as any).user && (
                    <span className="text-xs text-muted-foreground">— {(l as any).user.firstName} {(l as any).user.lastName}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{new Date(l.fromDate).toLocaleDateString('en-IN')} — {new Date(l.toDate).toLocaleDateString('en-IN')}</p>
                {l.reason && <p className="text-xs text-muted-foreground mt-1">{l.reason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <ApprovalStatusBadge status={l.status} />
                {((l.status === 'Pending' &&
                  ['Partner', 'Manager', 'Admin', 'HR'].includes(user?.role || '')) ||
                  (l.status === 'Manager Approved' &&
                    ['Partner', 'Admin', 'HR'].includes(user?.role || ''))) && (
                  <div className="flex gap-1 ml-2">
                    <button
                      type="button"
                      onClick={() => void handleApproveLeave(l.id, 'approve')}
                      className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-500"
                      title={
                        l.status === 'Manager Approved' ||
                        ['Partner', 'Admin', 'HR'].includes(user?.role || '')
                          ? 'Final approve'
                          : 'Approve'
                      }
                    >
                      <CheckCircle2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApproveLeave(l.id, 'reject')}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"
                      title="Reject"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {leaves.length === 0 && <p className="text-center text-muted-foreground py-8">No leave requests</p>}
        </div>
      )}
    </AppPageContainer>
  );
}
