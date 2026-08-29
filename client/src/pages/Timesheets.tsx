import { useEffect, useState } from 'react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { appAlert } from '@/context/AppDialogContext';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { canAttestTimesheets } from '@/lib/gradeCapabilities';
import { ApprovalStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { DownloadSimple as Download } from '@phosphor-icons/react';
import { downloadBlob } from '@/lib/downloadCsv';

interface Timesheet {
  date: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  totalHoursWorked: number;
  taskBreakdown: {
    taskName: string;
    engagementName: string;
    clientName: string;
    durationMinutes: number;
  }[];
  attestation?: { id?: string; status: string; reviewNote?: string | null };
}

interface FirmRow {
  user: { id: string; firstName: string; lastName: string; initials: string; role: string };
  totalHours: number;
  entryCount: number;
  attestationStatus?: string;
  attestationId?: string | null;
  attendance: {
    checkIn: string | null;
    checkOut: string | null;
    status: string;
    location: string | null;
    clientName: string | null;
    lateBand: string | null;
  } | null;
}

interface PendingDay {
  id: string;
  date: string;
  status: string;
  user: { id: string; firstName: string; lastName: string };
}

const FIRM_VIEW_ROLES = ['Partner', 'Admin', 'Manager', 'HR'];

export default function Timesheets() {
  const { user } = useAuth();
  const canFirm = Boolean(user && FIRM_VIEW_ROLES.includes(user.role));
  const canAttest = Boolean(
    user && canAttestTimesheets(user.role, user.hierarchyLevel?.code)
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [staffId, setStaffId] = useState(user?.id || '');
  const [sheet, setSheet] = useState<Timesheet | null>(null);
  const [firmRows, setFirmRows] = useState<FirmRow[]>([]);
  const [pending, setPending] = useState<PendingDay[]>([]);
  const [mode, setMode] = useState<'firm' | 'detail' | 'review'>(canFirm ? 'firm' : 'detail');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (user?.id && !staffId) setStaffId(user.id);
  }, [user, staffId]);

  useEffect(() => {
    if (!user || !canFirm) return;
    void api
      .get<{ rows: FirmRow[] }>(`/timesheets/firm?date=${date}`)
      .then((r) => setFirmRows(r.data.rows || []))
      .catch(() => setFirmRows([]));
  }, [user, date, canFirm]);

  useEffect(() => {
    if (!user || mode === 'firm' || mode === 'review') return;
    const id = staffId || user.id;
    void api
      .get<Timesheet>(`/timesheets?staffId=${id}&date=${date}`)
      .then((r) => setSheet(r.data))
      .catch(() => setSheet(null));
  }, [user, date, staffId, mode]);

  useEffect(() => {
    if (!user || !canAttest || mode !== 'review') return;
    void api
      .get<PendingDay[]>('/timesheets/pending-review')
      .then((r) => setPending(r.data || []))
      .catch(() => setPending([]));
  }, [user, canAttest, mode]);

  async function submitDay() {
    try {
      await api.post('/timesheets/submit', { date });
      await appAlert({ title: 'Submitted', message: 'Day sent for Manager / Senior Executive attestation.' });
      const r = await api.get<Timesheet>(`/timesheets?staffId=${user!.id}&date=${date}`);
      setSheet(r.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      await appAlert({ title: 'Could not submit', message: err?.response?.data?.error || 'Failed' });
    }
  }

  async function reviewDay(id: string, status: 'Approved' | 'Rejected') {
    try {
      await api.patch(`/timesheets/day/${id}`, { status });
      setPending((p) => p.filter((x) => x.id !== id));
      await appAlert({ title: 'Done', message: status === 'Approved' ? 'Timesheet attested.' : 'Timesheet rejected.' });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      await appAlert({ title: 'Action failed', message: err?.response?.data?.error || 'Failed' });
    }
  }

  async function exportTimesheetsMonth() {
    if (!canFirm || exporting) return;
    const month = date.slice(0, 7);
    setExporting(true);
    try {
      const response = await api.get<Blob>('/timesheets/firm/export', {
        params: { month },
        responseType: 'blob',
      });
      downloadBlob(`timesheets-${month}.csv`, response.data);
    } catch {
      await appAlert({ title: 'Export failed', message: 'Could not export timesheet records for this month.' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppPageContainer>
      <PageHeader
        title="Timesheets"
        description={
          canFirm
            ? 'Firm attendance + hours; submit days for attestation before WIP/billing'
            : 'Daily hours — submit for Manager / Senior Executive approval'
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="max-w-xs">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {canFirm && (
          <Button type="button" variant="outline" size="sm" onClick={() => void exportTimesheetsMonth()} disabled={exporting}>
            <Download size={16} className="mr-1" />
            {exporting ? 'Exporting…' : `Export ${date.slice(0, 7)}`}
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          {canFirm && (
            <Button type="button" variant={mode === 'firm' ? 'default' : 'outline'} size="sm" onClick={() => setMode('firm')}>
              Everyone
            </Button>
          )}
          <Button type="button" variant={mode === 'detail' ? 'default' : 'outline'} size="sm" onClick={() => setMode('detail')}>
            One person
          </Button>
          {canAttest && (
            <Button type="button" variant={mode === 'review' ? 'default' : 'outline'} size="sm" onClick={() => setMode('review')}>
              Pending attestation
            </Button>
          )}
        </div>
      </div>

      {mode === 'review' && canAttest ? (
        <PanelCard title="Submitted days awaiting attestation">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No timesheets waiting.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="py-2">Staff</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-2">
                      {row.user.firstName} {row.user.lastName}
                    </td>
                    <td className="py-2">{new Date(row.date).toLocaleDateString('en-IN')}</td>
                    <td className="py-2 space-x-2">
                      <Button type="button" size="sm" onClick={() => void reviewDay(row.id, 'Approved')}>
                        Approve
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void reviewDay(row.id, 'Rejected')}>
                        Reject
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PanelCard>
      ) : mode === 'firm' && canFirm ? (
        <PanelCard title={`Team — ${date}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="py-2 pr-3">Staff</th>
                  <th className="py-2 pr-3">Check-in</th>
                  <th className="py-2 pr-3">Place</th>
                  <th className="py-2 pr-3">Hours</th>
                  <th className="py-2">Attestation</th>
                </tr>
              </thead>
              <tbody>
                {firmRows.map((row) => (
                  <tr key={row.user.id} className="border-b border-border/50">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="text-left text-primary underline-offset-2 hover:underline"
                        onClick={() => {
                          setStaffId(row.user.id);
                          setMode('detail');
                        }}
                      >
                        {row.user.firstName} {row.user.lastName}
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      {row.attendance?.checkIn
                        ? new Date(row.attendance.checkIn).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      {row.attendance?.location || '—'}
                      {row.attendance?.clientName ? ` · ${row.attendance.clientName}` : ''}
                    </td>
                    <td className="py-2 pr-3">{row.totalHours}</td>
                    <td className="py-2">
                      <ApprovalStatusBadge status={row.attestationStatus || 'Draft'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      ) : (
        <PanelCard title={sheet ? `Total: ${sheet.totalHoursWorked} hrs` : 'Loading…'}>
          {canFirm && (
            <div className="mb-3 max-w-sm">
              <Label>Staff</Label>
              <select
                className="input-field mt-1 w-full"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                aria-label="Staff"
              >
                {firmRows.length > 0
                  ? firmRows.map((r) => (
                      <option key={r.user.id} value={r.user.id}>
                        {r.user.firstName} {r.user.lastName}
                      </option>
                    ))
                  : user && (
                      <option value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    )}
              </select>
            </div>
          )}
          {sheet && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <ApprovalStatusBadge status={sheet.attestation?.status || 'Draft'} />
                {staffId === user?.id &&
                  !['Submitted', 'Approved'].includes(sheet.attestation?.status || '') && (
                    <Button type="button" size="sm" onClick={() => void submitDay()}>
                      Submit day for approval
                    </Button>
                  )}
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Clock in: {sheet.clockInTime ? new Date(sheet.clockInTime).toLocaleTimeString() : '—'} · Clock out:{' '}
                {sheet.clockOutTime ? new Date(sheet.clockOutTime).toLocaleTimeString() : '—'}
              </p>
              {sheet.taskBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No time logged this day.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-left">
                      <th className="py-2">Task</th>
                      <th className="py-2">Engagement</th>
                      <th className="py-2">Client</th>
                      <th className="py-2">Minutes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.taskBreakdown.map((row) => (
                      <tr
                        key={`${row.taskName}:${row.engagementName}:${row.clientName}:${row.durationMinutes}`}
                        className="border-b border-border/50"
                      >
                        <td className="py-2">{row.taskName}</td>
                        <td className="py-2">{row.engagementName}</td>
                        <td className="py-2">{row.clientName}</td>
                        <td className="py-2">{row.durationMinutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </PanelCard>
      )}
    </AppPageContainer>
  );
}
