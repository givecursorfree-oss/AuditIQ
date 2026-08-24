import { useEffect, useState, useMemo, type ElementType } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, GraduationCap, DownloadSimple } from '@phosphor-icons/react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { appAlert } from '../context/AppDialogContext';
import { hasNavPermission } from '../lib/navAccess';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import { PanelCard } from '../components/layout/PanelCard';
import { EmptyState } from '../components/layout/StatePanels';
import { ApprovalStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { Button } from '@/components/ui/button';
import { apiAbsoluteUrl } from '@/lib/apiBase';

interface LeaveRequest {
  id: string;
  type: string;
  examLevel?: string | null;
  fromDate: string;
  toDate: string;
  days: number;
  status: string;
  reason?: string | null;
  user: { firstName: string; lastName: string; initials: string };
}

interface LeaveBalance {
  isArticle: boolean;
  articleshipStart?: string;
  articleshipEnd?: string;
  limits: { exam: number; casual: number; sick: number };
  used: { exam: number; casual: number; sick: number };
  remaining: { exam: number; casual: number; sick: number };
  firmLeave?: {
    credit: number;
    usedFromLeaves: number;
    attendanceDebitDays: number;
    softLateCount: number;
    hardLateCount: number;
    noAttdCount: number;
    used: number;
    remaining: number;
  };
}

interface StipendRecord {
  id: string;
  month: number;
  year: number;
  articleYear: number;
  amount: number;
  status: string;
  paidAt?: string | null;
  user: { firstName: string; lastName: string };
}

type LeaveTab = 'apply' | 'inbox' | 'calendar' | 'stipend' | 'ediary';

export default function LeaveStipend() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isIntern = user?.role === 'Intern';
  const isAdmin = user?.role === 'Admin';
  const canApply = Boolean(user && user.role !== 'Admin' && hasNavPermission(user, 'leave', 'apply'));
  const canManage = Boolean(user && hasNavPermission(user, 'leave', 'manage'));

  const [tab, setTab] = useState<LeaveTab>('apply');
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [inbox, setInbox] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [stipends, setStipends] = useState<StipendRecord[]>([]);
  const [icaiMin, setIcaiMin] = useState<Record<string, number>>({});
  const [calendar, setCalendar] = useState<LeaveRequest[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const [applyForm, setApplyForm] = useState({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    type: 'Casual' as 'Casual' | 'Sick' | 'Exam' | 'Study' | 'Earned',
    examLevel: 'Intermediate' as 'Foundation' | 'Intermediate' | 'Final',
    reason: '',
  });

  const visibleTabs = useMemo(() => {
    const tabs: { k: LeaveTab; l: string }[] = [];
    if (canApply) tabs.push({ k: 'apply', l: 'Apply for leave' });
    if (canManage) tabs.push({ k: 'inbox', l: 'Leave management' });
    if (canApply || canManage) tabs.push({ k: 'calendar', l: 'Calendar' });
    if (isIntern) {
      tabs.push({ k: 'stipend', l: 'Stipend' });
      tabs.push({ k: 'ediary', l: 'E-Diary export' });
    }
    return tabs;
  }, [canApply, canManage, isIntern]);

  async function load() {
    const tasks: Promise<void>[] = [
      api.get<LeaveRequest[]>('/attendance/leaves').then((r) => setLeaves(r.data)),
      api.get<LeaveBalance>('/attendance/leaves/balance').then((r) => setBalance(r.data)),
      api.get(`/stipend`).then((r) => {
        setStipends(r.data.records || []);
        setIcaiMin(r.data.icaiMinimum || {});
      }),
      api.get<LeaveRequest[]>(`/attendance/leaves/calendar?month=${month}`).then((r) => setCalendar(r.data)),
    ];
    if (canManage) {
      tasks.push(
        api.get<LeaveRequest[]>('/attendance/leaves/inbox?status=Pending').then((r) => setInbox(r.data))
      );
    }
    // Each panel degrades independently; a single failed call shouldn't blank the page
    await Promise.allSettled(tasks);
  }

  useEffect(() => { void load(); }, [month, canManage]);

  useEffect(() => {
    const raw = searchParams.get('tab');
    const q = ((raw === 'manage' ? 'inbox' : raw) as LeaveTab | null);
    if (q && visibleTabs.some((t) => t.k === q)) {
      setTab(q);
      return;
    }
    if (isAdmin && canManage) setTab('inbox');
    else if (canApply) setTab('apply');
    else if (canManage) setTab('inbox');
    else if (visibleTabs[0]) setTab(visibleTabs[0].k);
  }, [searchParams, visibleTabs, isAdmin, canApply, canManage]);

  const selectTab = (k: LeaveTab) => {
    setTab(k);
    setSearchParams(k === 'apply' ? {} : { tab: k });
  };

  async function applyLeave() {
    try {
      await api.post('/attendance/leaves', {
        ...applyForm,
        examLevel: applyForm.type === 'Exam' ? applyForm.examLevel : undefined,
      });
      await appAlert({
        title: 'Leave submitted',
        message: 'Your leave request was sent for manager review.',
      });
      setApplyForm({ ...applyForm, reason: '' });
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      await appAlert({ title: 'Could not apply', message: err?.response?.data?.error || 'Failed' });
    }
  }

  async function approveLeave(id: string, status: 'Manager Approved' | 'Approved' | 'Rejected') {
    try {
      await api.patch(`/attendance/leaves/${id}`, { status });
      if (status === 'Approved') {
        await appAlert({ title: 'Done', message: 'Leave sanctioned successfully.' });
      } else if (status === 'Rejected') {
        await appAlert({ title: 'Done', message: 'Leave rejected.' });
      } else {
        await appAlert({ title: 'Done', message: 'Leave forwarded for final sanction.' });
      }
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      await appAlert({ title: 'Action failed', message: err?.response?.data?.error || 'Failed' });
    }
  }

  function downloadEDiary() {
    window.open(apiAbsoluteUrl('/api/articleship/e-diary/export'), '_blank');
  }

  const pageTitle = canManage && !canApply ? 'Leave management' : isIntern ? 'Leave & Stipend' : 'Apply for leave';

  return (
    <AppPageContainer>
      <PageHeader
        title={pageTitle}
        description={
          isAdmin
            ? 'Review and sanction leave requests for your firm.'
            : user?.role === 'HR'
              ? 'Firm leave inbox, calendar, and leave balances for staff and articles.'
            : isIntern
              ? 'ICAI articleship leave balances, stipend, and e-diary.'
              : 'Submit leave requests for manager approval.'
        }
      />

      {balance && balance.isArticle && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <BalanceCard label="Exam Leave" used={balance.used.exam} limit={balance.limits.exam} icon={GraduationCap} />
          <BalanceCard label="Casual Leave" used={balance.used.casual} limit={balance.limits.casual} icon={Calendar} />
          <BalanceCard label="Sick Leave" used={balance.used.sick} limit={balance.limits.sick} icon={Calendar} />
          {balance.firmLeave && (
            <BalanceCard
              label="Firm leave (24)"
              used={balance.firmLeave.used}
              limit={balance.firmLeave.credit}
              icon={Calendar}
            />
          )}
        </div>
      )}
      {balance?.firmLeave && (
        <p className="text-xs text-muted-foreground">
          Firm leave includes casual leave taken plus attendance debits (late / no attendance).
          Soft late {balance.firmLeave.softLateCount} · Hard late {balance.firmLeave.hardLateCount} ·
          No attendance {balance.firmLeave.noAttdCount} · Attendance debit{' '}
          {balance.firmLeave.attendanceDebitDays} days.
        </p>
      )}

      <div className="flex gap-2 border-b border-border overflow-x-auto">
        {visibleTabs.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => selectTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              tab === t.k ? 'tab-active' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'apply' && canApply && (
        <PanelCard title="Apply for leave" className="max-w-2xl">
          <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-muted-foreground">From</span>
              <input type="date" className="input-field mt-1 w-full" value={applyForm.startDate} onChange={(e) => setApplyForm({ ...applyForm, startDate: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">To</span>
              <input type="date" className="input-field mt-1 w-full" value={applyForm.endDate} onChange={(e) => setApplyForm({ ...applyForm, endDate: e.target.value })} />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-muted-foreground">Leave type</span>
            <select className="input-field mt-1 w-full" value={applyForm.type} onChange={(e) => setApplyForm({ ...applyForm, type: e.target.value as typeof applyForm.type })}>
              <option value="Casual">Casual</option>
              <option value="Sick">Sick</option>
              <option value="Exam">Exam (CA)</option>
              <option value="Study">Study</option>
              <option value="Earned">Earned</option>
            </select>
          </label>
          {applyForm.type === 'Exam' && (
            <label className="block">
              <span className="text-sm text-muted-foreground">Exam level</span>
              <select className="input-field mt-1 w-full" value={applyForm.examLevel} onChange={(e) => setApplyForm({ ...applyForm, examLevel: e.target.value as typeof applyForm.examLevel })}>
                <option value="Foundation">Foundation</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Final">Final</option>
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm text-muted-foreground">Reason</span>
            <textarea className="input-field mt-1 w-full" rows={2} value={applyForm.reason} onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })} />
          </label>
          <Button type="button" onClick={() => void applyLeave()}>Submit application</Button>
          </div>
        </PanelCard>
      )}

      {tab === 'inbox' && canManage && (
        <PanelCard title="Leave inbox" bodyClassName="p-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header text-left">
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3 text-right">Days</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(inbox.length ? inbox : leaves.filter((l) => l.status === 'Pending' || l.status === 'Manager Approved')).map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-2">{l.user.firstName} {l.user.lastName}</td>
                  <td>{l.type}{l.examLevel ? ` (${l.examLevel})` : ''}</td>
                  <td>{new Date(l.fromDate).toLocaleDateString('en-IN')}</td>
                  <td>{new Date(l.toDate).toLocaleDateString('en-IN')}</td>
                  <td className="text-right">{l.days}</td>
                  <td><ApprovalStatusBadge status={l.status} /></td>
                  <td className="space-x-1 whitespace-nowrap">
                    {l.status === 'Pending' &&
                      ['Manager', 'Partner', 'Admin', 'HR'].includes(user?.role || '') && (
                      <button type="button" className="text-xs btn-secondary py-1 px-2" onClick={() => void approveLeave(l.id, 'Manager Approved')}>Approve (Mgr)</button>
                    )}
                    {(l.status === 'Manager Approved' || l.status === 'Pending') &&
                      ['Partner', 'Admin', 'HR'].includes(user?.role || '') && (
                      <button type="button" className="text-xs btn-primary py-1 px-2" onClick={() => void approveLeave(l.id, 'Approved')}>Sanction</button>
                    )}
                    {!['Approved', 'Rejected'].includes(l.status) &&
                      ['Manager', 'Partner', 'Admin', 'HR'].includes(user?.role || '') && (
                      <button type="button" className="text-xs text-danger" onClick={() => void approveLeave(l.id, 'Rejected')}>Reject</button>
                    )}
                  </td>
                </tr>
              ))}
              {inbox.length === 0 && leaves.filter((l) => l.status === 'Pending').length === 0 && (
                <tr><td colSpan={7}><EmptyState title="No leaves awaiting sanction" /></td></tr>
              )}
            </tbody>
          </table>
          </div>
        </PanelCard>
      )}

      {tab === 'calendar' && (
        <PanelCard
          title="Leave calendar"
          action={
            <input type="month" aria-label="Leave calendar month" className="input-field w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
          }
        >
          <div className="space-y-2">
            {calendar.length === 0 && (
              <EmptyState title="No approved leaves in this month" />
            )}
            {calendar.map((l) => (
              <div key={l.id} className="flex justify-between items-center p-3 bg-surface-muted rounded">
                <div>
                  <strong>{l.user.firstName} {l.user.lastName}</strong>
                  <span className="text-sm text-muted-foreground ml-2">{l.type}{l.examLevel ? ` (${l.examLevel})` : ''}</span>
                </div>
                <div className="text-sm">
                  {new Date(l.fromDate).toLocaleDateString('en-IN')} → {new Date(l.toDate).toLocaleDateString('en-IN')}
                  <span className="ml-2 text-muted-foreground">({l.days}d)</span>
                </div>
              </div>
            ))}
          </div>
        </PanelCard>
      )}

      {tab === 'stipend' && (
        <div className="space-y-3">
          <PanelCard title="ICAI minimum stipend (per month)">
            <ul className="form-grid-3 text-sm">
              <li>Year 1: <strong>₹{icaiMin[1] || 4000}</strong></li>
              <li>Year 2: <strong>₹{icaiMin[2] || 5000}</strong></li>
              <li>Year 3: <strong>₹{icaiMin[3] || 6000}</strong></li>
            </ul>
          </PanelCard>
          <PanelCard title="Stipend records" bodyClassName="p-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
              <thead>
                <tr className="table-header text-left">
                  <th className="px-4 py-3">Staff</th><th className="px-4 py-3">Month</th><th className="px-4 py-3">Article Yr</th>
                  <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Paid on</th>
                </tr>
              </thead>
              <tbody>
                {stipends.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2">{s.user.firstName} {s.user.lastName}</td>
                    <td>{s.month}/{s.year}</td>
                    <td>{s.articleYear}</td>
                    <td className="text-right">₹{Number(s.amount).toLocaleString('en-IN')}</td>
                    <td><ApprovalStatusBadge status={s.status} /></td>
                    <td>{s.paidAt ? new Date(s.paidAt).toLocaleDateString('en-IN') : '—'}</td>
                  </tr>
                ))}
                {stipends.length === 0 && <tr><td colSpan={6}><EmptyState title="No stipend records" /></td></tr>}
              </tbody>
            </table>
          </div>
          </PanelCard>
        </div>
      )}

      {tab === 'ediary' && (
        <PanelCard title="ICAI E-Diary export" className="max-w-2xl">
          <div className="space-y-3">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <GraduationCap size={20} className="shrink-0" />
            Downloads a structured fortnightly text report you can paste into the ICAI SSP Portal E-Diary.
          </p>
          <Button type="button" className="gap-2" onClick={downloadEDiary}>
            <DownloadSimple size={16} /> Download fortnightly E-Diary
          </Button>
          </div>
        </PanelCard>
      )}
    </AppPageContainer>
  );
}

function BalanceCard({ label, used, limit, icon: Icon }: { label: string; used: number; limit: number; icon: ElementType }) {
  const pct = Math.min(100, (used / limit) * 100);
  const IconComp = Icon as React.ComponentType<{ className?: string }>;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-lg sm:text-xl font-semibold text-foreground">
            {limit - used} <span className="text-sm text-muted-foreground">/ {limit} days left</span>
          </p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/30 shrink-0">
          <IconComp className="size-5 text-muted-foreground" />
        </div>
      </div>
      <div className="mt-3 h-2 bg-surface-muted rounded">
        <div className="h-2 bg-primary rounded" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
