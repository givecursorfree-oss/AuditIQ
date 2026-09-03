import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock, Calendar, SignIn as LogIn, SignOut as LogOut,
  CaretLeft as ChevronLeft, CaretRight as ChevronRight, DownloadSimple,
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
import { PanelCard, MetricCard } from '../components/layout/PanelCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { attendanceLoginNotice } from '../lib/attendanceLoginNotice';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { appToast, gooeyToast } from '@/context/AppToastContext';
import { downloadCsv } from '@/lib/downloadCsv';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PLACES: PlaceOfWork[] = ['Office', 'Client Place', 'Work from Home'];
const FIRM_ATTENDANCE_ROLES = ['Partner', 'Admin', 'Manager', 'HR'];

export default function AttendancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canViewFirmAttendance = Boolean(user && FIRM_ATTENDANCE_ROLES.includes(user.role));
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null);
  const [isArticle, setIsArticle] = useState(false);
  const [placeOfWork, setPlaceOfWork] = useState<PlaceOfWork>('Office');
  const [clientName, setClientName] = useState('');
  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
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
          .get<{ isArticle?: boolean }>('/attendance/leaves/balance')
          .catch(() => ({ data: { isArticle: false } as { isArticle?: boolean } })),
      ]);
      setRecords(attRes.data);
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
        variant: 'info',
        title: 'Checked in',
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

  const dayState = attendanceDayState(todayRecord);
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

  const exportAttendanceMonth = async () => {
    if (!canViewFirmAttendance || exporting) return;
    const monthKey = `${curYear}-${String(curMonth).padStart(2, '0')}`;
    setExporting(true);
    try {
      const { data } = await api.get<Attendance[]>(`/attendance?month=${monthKey}`);
      downloadCsv(
        `attendance-${monthKey}.csv`,
        ['Date', 'Staff', 'Role', 'Status', 'Location', 'Client', 'Check-in', 'Check-out', 'Hours', 'Method'],
        data.map((record) => [
          new Date(record.date).toLocaleDateString('en-IN'),
          record.user ? `${record.user.firstName} ${record.user.lastName}`.trim() : '',
          record.user?.role || '',
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
      await appAlert({ title: 'Export failed', message: 'Could not export attendance records for this month.' });
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
          <div className="flex items-center gap-2">
            {canViewFirmAttendance && (
              <Button type="button" size="sm" variant="outline" onClick={() => void exportAttendanceMonth()} disabled={exporting}>
                <DownloadSimple size={16} className="mr-1" />
                {exporting ? 'Exporting…' : 'Export month'}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to="/leave-stipend?tab=apply">Leave</Link>
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar size={15} />
              <span className="hidden sm:inline">View date</span>
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
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground"
                aria-label="View attendance date"
              />
            </label>
            {selectedDate && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedDate('')}>
                Month
              </Button>
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

      <PanelCard
        title="Today"
        action={
          <div className="flex items-center gap-2">
            {dayState === 'open' && (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/time-tracker?start=1">Time tracker</Link>
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/leave-stipend?tab=apply">Leave</Link>
            </Button>
          </div>
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
                  {todayRecord.hoursWorked != null || dayState === 'closed'
                    ? Number(todayRecord.hoursWorked ?? hoursBetween(todayRecord.checkIn, todayRecord.checkOut) ?? 0).toFixed(1)
                    : '—'}
                </dd>
              </div>
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

      <PanelCard title="Filter attendance records">
        <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
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
      </PanelCard>

      {loading ? (
        <PageLoading className="h-32 py-0" />
      ) : (
        <div className="space-y-1">
          {filteredRecords.map((r) => (
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
            <EmptyState title={records.length === 0 ? 'No attendance records' : 'No matching records'} />
          )}
        </div>
      )}
    </AppPageContainer>
  );
}
