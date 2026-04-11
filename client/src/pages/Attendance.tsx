import { useState, useEffect } from 'react';
import {
  Clock, MapPin, Calendar, CheckCircle2, XCircle, LogIn, LogOut,
  Search, ChevronLeft, ChevronRight
} from 'lucide-react';
import api from '../services/api';
import type { Attendance, LeaveRequest } from '../types';
import { useAuth } from '../context/AuthContext';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AttendancePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'attendance' | 'leaves'>('attendance');
  const [records, setRecords] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [curMonth, setCurMonth] = useState(() => new Date().getMonth() + 1);
  const [curYear, setCurYear] = useState(() => new Date().getFullYear());
  const [summary, setSummary] = useState<{ totalDays: number; totalHours: number; presentDays: number; lateDays: number } | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      api.get('/attendance').then(({ data }) => {
        setRecords(data);
        const today = new Date().toISOString().split('T')[0];
        const t = data.find((r: Attendance) => r.date?.startsWith(today) || r.checkIn?.startsWith(today));
        setTodayRecord(t || null);
      }),
      api.get('/attendance/leaves').then(({ data }) => setLeaves(data)),
      api.get(`/attendance/summary?month=${curYear}-${curMonth}`).then(({ data }) => setSummary(data)),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [curMonth, curYear]);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      await api.post('/attendance/check-in', { method: 'manual' });
      fetchAll();
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    setCheckingIn(true);
    try {
      await api.post('/attendance/check-out');
      fetchAll();
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingIn(false);
    }
  };

  const prevMonth = () => {
    if (curMonth === 1) { setCurMonth(12); setCurYear(curYear - 1); }
    else setCurMonth(curMonth - 1);
  };
  const nextMonth = () => {
    if (curMonth === 12) { setCurMonth(1); setCurYear(curYear + 1); }
    else setCurMonth(curMonth + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Attendance</h1>
          <p className="text-sm text-foreground-muted">{MONTHS[curMonth - 1]} {curYear}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-hover-bg"><ChevronLeft size={16} className="text-foreground-muted" /></button>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-hover-bg"><ChevronRight size={16} className="text-foreground-muted" /></button>
        </div>
      </div>

      {/* Today's status */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm text-foreground-muted">Today — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          {todayRecord ? (
            <div className="flex items-center gap-4 mt-1">
              <span className="text-sm text-foreground flex items-center gap-1">
                <LogIn size={14} className="text-success" />
                {todayRecord.checkIn ? new Date(todayRecord.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
              {todayRecord.checkOut && (
                <span className="text-sm text-foreground flex items-center gap-1">
                  <LogOut size={14} className="text-danger" />
                  {new Date(todayRecord.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {todayRecord.hoursWorked != null && (
                <span className="text-sm text-foreground-muted">{Number(todayRecord.hoursWorked).toFixed(1)} hrs</span>
              )}
            </div>
          ) : (
            <p className="text-sm text-foreground-muted mt-1">Not checked in yet</p>
          )}
        </div>
        <div>
          {!todayRecord ? (
            <button onClick={handleCheckIn} disabled={checkingIn} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              <LogIn size={16} /> {checkingIn ? 'Processing...' : 'Check In'}
            </button>
          ) : !todayRecord.checkOut ? (
            <button onClick={handleCheckOut} disabled={checkingIn} className="btn-danger flex items-center gap-2 disabled:opacity-50">
              <LogOut size={16} /> {checkingIn ? 'Processing...' : 'Check Out'}
            </button>
          ) : (
            <span className="badge-success flex items-center gap-1"><CheckCircle2 size={12} /> Done for today</span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card text-center">
            <p className="text-3xl font-bold text-foreground">{summary.presentDays ?? summary.totalDays}</p>
            <p className="text-xs text-foreground-muted mt-1">Days Present</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-foreground">{summary.totalHours && summary.presentDays ? (summary.totalHours / summary.presentDays).toFixed(1) : '0'}</p>
            <p className="text-xs text-foreground-muted mt-1">Avg Hours/Day</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
        <button onClick={() => setTab('attendance')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'attendance' ? 'bg-card-hover text-foreground' : 'text-foreground-muted hover:text-foreground-secondary'}`}>Records</button>
        <button onClick={() => setTab('leaves')} className={`text-sm px-4 py-1.5 rounded-md transition-colors ${tab === 'leaves' ? 'bg-card-hover text-foreground' : 'text-foreground-muted hover:text-foreground-secondary'}`}>Leave Requests</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'attendance' ? (
        <div className="space-y-1">
          {records.map(r => (
            <div key={r.id} className="card flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock size={14} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm text-foreground">{r.date ? new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}</p>
                  <p className="text-xs text-foreground-muted">{r.method || 'manual'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-foreground-muted">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span className="text-foreground-muted">→</span>
                <span className="text-foreground-muted">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span className="text-foreground-muted w-14 text-right">{r.hoursWorked != null ? Number(r.hoursWorked).toFixed(1) : '—'} h</span>
              </div>
            </div>
          ))}
          {records.length === 0 && <p className="text-center text-foreground-muted py-8">No attendance records this month</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {leaves.map(l => (
            <div key={l.id} className="card flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">{l.type} Leave</p>
                <p className="text-xs text-foreground-muted">{new Date(l.fromDate).toLocaleDateString('en-IN')} — {new Date(l.toDate).toLocaleDateString('en-IN')}</p>
                {l.reason && <p className="text-xs text-foreground-muted mt-1">{l.reason}</p>}
              </div>
              <span className={l.status === 'Approved' ? 'badge-success' : l.status === 'Rejected' ? 'badge-danger' : 'badge-warning'}>{l.status}</span>
            </div>
          ))}
          {leaves.length === 0 && <p className="text-center text-foreground-muted py-8">No leave requests</p>}
        </div>
      )}
    </div>
  );
}
