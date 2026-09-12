import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock, Calendar, SignIn as LogIn, SignOut as LogOut,
  CaretLeft as ChevronLeft, CaretRight as ChevronRight, DownloadSimple,
  CaretDown as ChevronDown, Funnel,
} from '@phosphor-icons/react';
import api from '../services/api';
import type { Attendance } from '../types';
import { useAuth } from '../context/AuthContext';
import { tryAttendanceCheckIn, tryAttendanceResume, requestAttendanceLocation, type PlaceOfWork } from '../lib/attendancePopup';
import { hoursBetween } from '../lib/attendanceDates';
import { attendanceDayState } from '../lib/attendanceDayGate';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import PageLoading from '@/components/layout/PageLoading';
import { EmptyState } from '../components/layout/EmptyState';
import { PanelCard } from '../components/layout/PanelCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { attendanceLoginNotice } from '../lib/attendanceLoginNotice';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { appToast, gooeyToast } from '@/context/AppToastContext';
import { downloadCsv } from '@/lib/downloadCsv';
import { formatStaffTitle } from '@/lib/roleLabels';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PLACES: PlaceOfWork[] = ['Office', 'Client Place', 'Work from Home'];
const FIRM_ATTENDANCE_ROLES = ['Partner', 'Admin', 'Manager', 'HR'];

function defaultExportRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(last).padStart(2, '0')}`,
  };
}

export default function AttendancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canViewFirmAttendance = Boolean(user && FIRM_ATTENDANCE_ROLES.includes(user.role));
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null);
  const [isArticle, setIsArticle] = useState(false);
  const [leaveSnippet, setLeaveSnippet] = useState<{
    firmRemaining?: number;
    firmCredit?: number;
    casualRemaining?: number;
    sickRemaining?: number;
    examRemaining?: number;
    isArticle?: boolean;
  } | null>(null);
  const [placeOfWork, setPlaceOfWork] = useState<PlaceOfWork>('Office');
  const [clientName, setClientName] = useState('');
  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFrom, setExportFrom] = useState(() => defaultExportRange().from);
  const [exportTo, setExportTo] = useState(() => defaultExportRange().to);
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [liveHours, setLiveHours] = useState<number | null>(null);
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
      const attendanceQuery = selectedDate
        ? `?date=${encodeURIComponent(selectedDate)}`
        : `?month=${curYear}-${String(curMonth).padStart(2, '0')}`;
      const [attRes, summaryRes, balanceRes] = await Promise.all([
        api.get<Attendance[]>(`/attendance${attendanceQuery}`),
        api.get(`/attendance/summary?month=${curYear}-${String(curMonth).padStart(2, '0')}`),
        api
          .get<{
            isArticle?: boolean;
            remaining?: { exam: number; casual: number; sick: number };
            firmLeave?: { remaining: number; credit: number };
          }>('/attendance/leaves/balance')
          .catch(() => ({
            data: {} as {
              isArticle?: boolean;
              remaining?: { exam: number; casual: number; sick: number };
              firmLeave?: { remaining: number; credit: number };
            },
          })),
      ]);
      setRecords(attRes.data);
      setSummary(summaryRes.data);
      if (balanceRes.data?.isArticle) setIsArticle(true);
      const bal = balanceRes.data;
      if (bal?.firmLeave || bal?.remaining) {
        setLeaveSnippet({
          isArticle: bal.isArticle,
          firmRemaining: bal.firmLeave?.remaining,
          firmCredit: bal.firmLeave?.credit,
          casualRemaining: bal.remaining?.casual,
          sickRemaining: bal.remaining?.sick,
          examRemaining: bal.remaining?.exam,
        });
      } else {
        setLeaveSnippet(null);
      }
      await loadTodayRecord();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not load attendance. Please refresh.';
      await appAlert(msg);
    } finally {
      setLoading(false);
    }
  }, [curMonth, curYear, selectedDate]);

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
      const remote = placeOfWork === 'Client Place' || placeOfWork === 'Work from Home';
      const fix = await requestAttendanceLocation({
        purpose: remote ? 'remote' : 'office',
        confirm: appConfirm,
      });
      const gps = {
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyMeters: fix.accuracyMeters,
      };
      loadingId = gooeyToast.info(remote ? 'Checking attendance…' : 'Checking location…', {
        description: remote
          ? placeOfWork === 'Work from Home'
            ? isArticle
              ? 'Recording GPS + IP · WFH needs prior manager approval.'
              : 'Recording GPS and network IP for Work from Home.'
            : 'Recording GPS and network IP for Client Place.'
          : 'Verifying your location at the office.',
        timing: { displayDuration: 2_147_483_647 },
        showTimestamp: false,
      });
      // Always POST for explicit Check in; never trust stale session flags alone
      await tryAttendanceCheckIn(user.id, 'manual', {
        skipIfAlreadyDone: false,
        forcePopup: true,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracyMeters: gps.accuracyMeters,
        gpsAttempted: true,
        placeOfWork,
        clientName: placeOfWork === 'Client Place' ? clientName.trim() : undefined,
      });
      if (loadingId != null) gooeyToast.dismiss(loadingId);
      gooeyToast.dismiss();

      await loadTodayRecord();
      const verified = await api.get<Attendance | null>('/attendance/me/today');
      const open = attendanceDayState(verified.data) === 'open';
      if (!open) {
        throw new Error('Check-in did not stick. Refresh and try again.');
      }
      setTodayRecord(verified.data);

      appToast({
        variant: 'info',
        title: 'Checked in',
        message:
          placeOfWork === 'Office'
            ? 'You are checked in. End day when you finish.'
            : `Checked in · ${placeOfWork}. End day when you finish.`,
        durationMs: 3500,
      });
      // Stay on Attendance so Working + End day are visible (Time tracker link appears in Today header)
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
        variant: 'info',
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
      title: 'End day?',
      message:
        'Closes attendance for today. App logout does not end the day. Use Resume day if this was a mistake.',
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
        'Could not end day. Please try again.';
      await appAlert(msg);
    } finally {
      setCheckingIn(false);
    }
  };

  // ponytail: yesterday-open prompt deferred (no lightweight prior-day API)
  const dayState = attendanceDayState(todayRecord);

  useEffect(() => {
    if (dayState !== 'open' || !todayRecord?.checkIn) {
      setLiveHours(null);
      return;
    }
    const tick = () => {
      const hrs = hoursBetween(todayRecord.checkIn, new Date().toISOString());
      setLiveHours(hrs ?? null);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [dayState, todayRecord?.checkIn]);

  const filteredRecords = records.filter((record) => {
    const matchesStatus = statusFilter === 'all' || record.status.toLowerCase() === statusFilter;
    const matchesLocation = locationFilter === 'all' || (record.location || '') === locationFilter;
    return matchesStatus && matchesLocation;
  });

  const prevMonth = () => {
    setSelectedDate('');
    setCalendarMonth(({ month, year }) =>
      month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
    );
  };
  const nextMonth = () => {
    setSelectedDate('');
    setCalendarMonth(({ month, year }) =>
      month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
    );
  };

  const exportAttendanceRange = async () => {
    if (!canViewFirmAttendance || exporting) return;
    if (!exportFrom || !exportTo) {
      await appAlert({ title: 'Select dates', message: 'Choose from and to dates for the export.' });
      return;
    }
    if (exportFrom > exportTo) {
      await appAlert({ title: 'Invalid range', message: 'From date must be on or before to date.' });
      return;
    }
    setExporting(true);
    try {
      const { data } = await api.get<Attendance[]>('/attendance', {
        params: { from: exportFrom, to: exportTo },
      });
      downloadCsv(
        `attendance-${exportFrom}_to_${exportTo}.csv`,
        ['Date', 'Staff', 'Designation', 'Status', 'Location', 'Client', 'Check-in', 'Check-out', 'Hours', 'Method'],
        data.map((record) => [
          new Date(record.date).toLocaleDateString('en-IN'),
          record.user ? `${record.user.firstName} ${record.user.lastName}`.trim() : '',
          record.user ? formatStaffTitle(record.user) : '',
          record.status,
          record.location || '',
          record.clientName || '',
          record.checkIn ? new Date(record.checkIn).toLocaleString('en-IN') : '',
          record.checkOut ? new Date(record.checkOut).toLocaleString('en-IN') : '',
          record.hoursWorked ?? hoursBetween(record.checkIn, record.checkOut) ?? '',
          record.method,
        ])
      );
    } catch {
      await appAlert({ title: 'Export failed', message: 'Could not export attendance records for this date range.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppPageContainer className="space-y-6">
      <PageHeader
        title="Attendance"
        description={`${MONTHS[curMonth - 1]} ${curYear}`}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            {canViewFirmAttendance && (
              <>
                <label className="block">
                  <span className="text-xs text-muted-foreground">From</span>
                  <Input
                    type="date"
                    className="mt-1 h-8 w-auto"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">To</span>
                  <Input
                    type="date"
                    className="mt-1 h-8 w-auto"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                  />
                </label>
                <Button type="button" size="sm" variant="outline" onClick={() => void exportAttendanceRange()} disabled={exporting}>
                  <DownloadSimple size={16} className="mr-1" />
                  {exporting ? 'Exporting…' : 'Export'}
                </Button>
              </>
            )}
            <Button type="button" size="sm" variant="outline" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft size={16} />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={nextMonth} aria-label="Next month">
              <ChevronRight size={16} />
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <PanelCard
            title="Today"
            action={
              dayState === 'open' ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link to="/time-tracker?start=1">Time tracker</Link>
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{todayLabel || '\u00a0'}</p>
                {dayState === 'none' && <Badge variant="outline">Not checked in</Badge>}
                {dayState === 'open' && <Badge variant="default">Working</Badge>}
                {dayState === 'closed' && <Badge variant="secondary">Day ended</Badge>}
              </div>

              {todayRecord && (
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border text-sm sm:grid-cols-4">
                  <div className="bg-card px-3 py-2">
                    <dt className="text-[11px] text-muted-foreground">In</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {todayRecord.checkIn
                        ? new Date(todayRecord.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </dd>
                  </div>
                  <div className="bg-card px-3 py-2">
                    <dt className="text-[11px] text-muted-foreground">Out</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {todayRecord.checkOut
                        ? new Date(todayRecord.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </dd>
                  </div>
                  <div className="bg-card px-3 py-2">
                    <dt className="text-[11px] text-muted-foreground">Location</dt>
                    <dd className="mt-0.5 truncate font-medium">
                      {todayRecord.location || '—'}
                      {todayRecord.clientName ? ` · ${todayRecord.clientName}` : ''}
                    </dd>
                  </div>
                  <div className="bg-card px-3 py-2">
                    <dt className="text-[11px] text-muted-foreground">Hours</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {dayState === 'open' && liveHours != null
                        ? liveHours.toFixed(1)
                        : todayRecord.hoursWorked != null || dayState === 'closed'
                          ? Number(todayRecord.hoursWorked ?? hoursBetween(todayRecord.checkIn, todayRecord.checkOut) ?? 0).toFixed(1)
                          : '—'}
                    </dd>
                  </div>
                  {(todayRecord.ipAddress || (todayRecord.gpsLat != null && todayRecord.gpsLng != null)) && (
                    <>
                      {todayRecord.ipAddress && (
                        <div className="bg-card px-3 py-2 sm:col-span-2">
                          <dt className="text-[11px] text-muted-foreground">IP</dt>
                          <dd className="mt-0.5 truncate font-medium tabular-nums">{todayRecord.ipAddress}</dd>
                        </div>
                      )}
                      {todayRecord.gpsLat != null && todayRecord.gpsLng != null && (
                        <div className="bg-card px-3 py-2 sm:col-span-2">
                          <dt className="text-[11px] text-muted-foreground">GPS</dt>
                          <dd className="mt-0.5 truncate font-medium tabular-nums">
                            {todayRecord.gpsLat.toFixed(5)}, {todayRecord.gpsLng.toFixed(5)}
                            {todayRecord.gpsAccuracy != null ? ` (±${Math.round(todayRecord.gpsAccuracy)}m)` : ''}
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              )}

              {dayState === 'none' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Place of work</Label>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Place of work">
                      {PLACES.map((p) => (
                        <Button
                          key={p}
                          type="button"
                          size="sm"
                          variant={placeOfWork === p ? 'default' : 'outline'}
                          className={cn('h-10 min-w-[7rem] flex-1 sm:flex-none', placeOfWork === p && 'ring-1 ring-primary/30')}
                          onClick={() => setPlaceOfWork(p)}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {placeOfWork === 'Client Place' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="attendance-client">Client</Label>
                      <Input
                        id="attendance-client"
                        list="attendance-client-names"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="h-10"
                        autoComplete="organization"
                      />
                      <datalist id="attendance-client-names">
                        {clientOptions.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                  )}
                  <Button
                    type="button"
                    className="h-11 w-full sm:w-auto sm:min-w-[10rem]"
                    disabled={checkingIn}
                    onClick={() => void handleCheckIn()}
                  >
                    <LogIn size={16} className="mr-1.5" />
                    {checkingIn ? 'Processing…' : 'Check in'}
                  </Button>
                </div>
              )}

              {dayState === 'open' && (
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 w-full sm:w-auto"
                  disabled={checkingIn}
                  onClick={() => void handleCheckOut()}
                >
                  <LogOut size={16} className="mr-1.5" />
                  {checkingIn ? 'Processing…' : 'End day'}
                </Button>
              )}

              {dayState === 'closed' && (
                <Button type="button" className="h-11" disabled={checkingIn} onClick={() => void handleResumeDay()}>
                  <LogIn size={16} className="mr-1.5" />
                  {checkingIn ? 'Processing…' : 'Resume day'}
                </Button>
              )}
            </div>
          </PanelCard>
        </div>

        <aside className="flex flex-col gap-4 lg:col-span-5">
          <PanelCard title="This month">
            {loading && !summary ? (
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-14 rounded-md" />
                <Skeleton className="h-14 rounded-md" />
              </div>
            ) : summary ? (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">Days present</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{summary.presentDays ?? summary.totalDays}</dd>
                </div>
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">Avg hours/day</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">
                    {summary.totalHours && summary.presentDays
                      ? (summary.totalHours / summary.presentDays).toFixed(1)
                      : '0'}
                  </dd>
                </div>
                {summary.articlePolicy && (
                  <>
                    <div className="rounded-md border border-border bg-card px-3 py-2">
                      <dt className="text-[11px] text-muted-foreground">Late debit (days)</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{summary.articlePolicy.lateDebitDays}</dd>
                    </div>
                    <div className="rounded-md border border-border bg-card px-3 py-2">
                      <dt className="text-[11px] text-muted-foreground">No attendance debit (days)</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{summary.articlePolicy.noAttdDebitDays}</dd>
                    </div>
                  </>
                )}
              </dl>
            ) : null}
          </PanelCard>
          <PanelCard title="Leave">
            {loading && !leaveSnippet ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-14 rounded-md" />
                  <Skeleton className="h-14 rounded-md" />
                </div>
                <Skeleton className="h-9 w-28 rounded-md" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {leaveSnippet && (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    {leaveSnippet.firmRemaining != null && leaveSnippet.firmCredit != null && (
                      <div className="rounded-md border border-border bg-card px-3 py-2">
                        <dt className="text-[11px] text-muted-foreground">Firm leave</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">
                          {leaveSnippet.firmRemaining}
                          <span className="text-muted-foreground font-normal"> / {leaveSnippet.firmCredit}</span>
                        </dd>
                      </div>
                    )}
                    {leaveSnippet.isArticle && leaveSnippet.casualRemaining != null && (
                      <div className="rounded-md border border-border bg-card px-3 py-2">
                        <dt className="text-[11px] text-muted-foreground">Casual</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">{leaveSnippet.casualRemaining}</dd>
                      </div>
                    )}
                    {leaveSnippet.isArticle && leaveSnippet.sickRemaining != null && (
                      <div className="rounded-md border border-border bg-card px-3 py-2">
                        <dt className="text-[11px] text-muted-foreground">Sick</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">{leaveSnippet.sickRemaining}</dd>
                      </div>
                    )}
                    {leaveSnippet.isArticle && leaveSnippet.examRemaining != null && (
                      <div className="rounded-md border border-border bg-card px-3 py-2">
                        <dt className="text-[11px] text-muted-foreground">Exam</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">{leaveSnippet.examRemaining}</dd>
                      </div>
                    )}
                  </dl>
                )}
                <Button type="button" size="sm" className="w-full sm:w-auto" asChild>
                  <Link to="/leave-stipend?tab=apply">Apply leave</Link>
                </Button>
              </div>
            )}
          </PanelCard>
        </aside>
      </div>

      <PanelCard
        title="History"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar size={14} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedDate(value);
                  if (value) {
                    const [year, month] = value.split('-').map(Number);
                    setCalendarMonth({ year, month });
                  }
                }}
                className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground"
                aria-label="View attendance date"
              />
            </label>
            {selectedDate && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedDate('')}>
                Month
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Funnel size={14} className="mr-1" />
              Filters
              {(statusFilter !== 'all' || locationFilter !== 'all') && (
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">On</span>
              )}
              <ChevronDown size={14} className={cn('ml-1 transition-transform', filtersOpen && 'rotate-180')} />
            </Button>
          </div>
        }
      >
        {filtersOpen && (
          <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-border pb-4">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 min-w-36 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                aria-label="Filter attendance by status"
              >
                <option value="all">All statuses</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half-day">Half-day</option>
                <option value="absent">Absent</option>
                <option value="leave">Leave</option>
                <option value="wfh-pending">WFH pending</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Location</span>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="h-10 min-w-44 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                aria-label="Filter attendance by location"
              >
                <option value="all">All locations</option>
                <option value="Office">Office</option>
                <option value="Client Place">Client Place</option>
                <option value="Work from Home">Work from Home</option>
              </select>
            </label>
            {(statusFilter !== 'all' || locationFilter !== 'all') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('all');
                  setLocationFilter('all');
                }}
              >
                Clear filters
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              Showing {filteredRecords.length} of {records.length} record{records.length === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {loading ? (
          <PageLoading className="h-32 py-0" />
        ) : (
          <div className="space-y-1">
            {filteredRecords.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-border py-3 last:border-0">
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
                <div className="flex flex-wrap items-center justify-end gap-2 text-sm sm:gap-4">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
                    {r.status || '—'}
                  </span>
                  <span className="hidden max-w-36 truncate text-xs text-muted-foreground sm:inline">
                    {r.location || 'Not recorded'}
                  </span>
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
            {filteredRecords.length === 0 && (
              <EmptyState
                title={records.length === 0 ? 'No attendance records' : 'No matching records'}
                description={
                  records.length === 0
                    ? 'Attendance for this period will show here.'
                    : 'Try another filter or clear filters.'
                }
                illustration={records.length === 0 ? 'person-wait' : 'person-search'}
                illustrationSize="sm"
                action={
                  records.length > 0 && (statusFilter !== 'all' || locationFilter !== 'all') ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setStatusFilter('all');
                        setLocationFilter('all');
                        setFiltersOpen(true);
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        )}
      </PanelCard>
    </AppPageContainer>
  );
}
