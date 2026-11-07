import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../services/api';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import { PanelCard } from '../components/layout/PanelCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useAppToast } from '@/context/AppToastContext';
import { useAuth } from '@/context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type StagedRow = {
  rowIndex: number;
  employeeCode: string;
  bioName: string;
  date: string;
  inTime: string | null;
  outTime: string | null;
  workHrs: string | null;
  matchAction: 'use_code' | 'use_name' | 'manual' | 'unresolved';
  matchedUserId: string | null;
  matchedUserName: string | null;
  errors: string[];
  warnings: string[];
};

type StaffOpt = { id: string; name: string; employeeCode: string | null };

type ReviewRow = {
  biometricDayId: string;
  date: string;
  employeeCode: string;
  bioName: string;
  staffName: string | null;
  appIn: string | null;
  appOut: string | null;
  bioIn: string | null;
  bioOut: string | null;
  bioHrs: string | null;
  finalIn: string | null;
  finalOut: string | null;
  finalHrs: string | null;
  finalBasis: string;
  validation: string;
  canApplyBioOut: boolean;
};

function monthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(last).padStart(2, '0')}`,
  };
}

function rowReady(row: StagedRow): boolean {
  if (!row.matchedUserId || !row.employeeCode || !row.date) return false;
  const blocking = row.errors.filter(
    (e) => !/employeeCode|No staff|Multiple staff|pick manually/i.test(e)
  );
  return blocking.length === 0;
}

export default function BiometricImportPage() {
  const { user } = useAuth();
  const { showToast } = useAppToast();
  const canHr = ['Partner', 'Admin', 'HR'].includes(user?.role || '');
  const [rows, setRows] = useState<StagedRow[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ total: number; ready: number; blocked: number } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPicks, setMapPicks] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [reviewRange, setReviewRange] = useState(monthRange);

  const readyCount = useMemo(() => rows.filter(rowReady).length, [rows]);

  const loadReview = useCallback(async () => {
    try {
      const { data } = await api.get<{ rows: ReviewRow[] }>('/attendance/biometric/review', {
        params: { from: reviewRange.from, to: reviewRange.to },
      });
      setReview(data.rows || []);
    } catch {
      setReview([]);
    }
  }, [reviewRange.from, reviewRange.to]);

  const uniqueBios = useMemo(() => {
    const byCode = new Map<string, { employeeCode: string; bioName: string; matchAction: StagedRow['matchAction']; matchedUserId: string | null }>();
    for (const r of rows) {
      if (!r.employeeCode) continue;
      if (!byCode.has(r.employeeCode)) {
        byCode.set(r.employeeCode, {
          employeeCode: r.employeeCode,
          bioName: r.bioName,
          matchAction: r.matchAction,
          matchedUserId: r.matchedUserId,
        });
      }
    }
    return [...byCode.values()];
  }, [rows]);

  const needsMap = useMemo(
    () => uniqueBios.filter((b) => b.matchAction !== 'use_code' || !b.matchedUserId),
    [uniqueBios]
  );

  useEffect(() => {
    if (!canHr) return;
    void api
      .get<{ staff: StaffOpt[] }>('/attendance/biometric/staff-options')
      .then((r) => setStaff(r.data.staff || []))
      .catch(() => setStaff([]));
  }, [canHr]);

  useEffect(() => {
    if (!canHr) return;
    void loadReview();
  }, [canHr, loadReview]);

  if (user && !canHr) {
    return <Navigate to="/attendance" replace />;
  }

  async function downloadTemplate() {
    const res = await api.get('/attendance/biometric/template', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'biometric-import-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<{
        rows: StagedRow[];
        summary: { total: number; ready: number; blocked: number };
      }>('/attendance/biometric/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setRows(data.rows);
      setSummary(data.summary);
      const pending = new Map<string, string>();
      for (const r of data.rows) {
        if (!r.employeeCode) continue;
        if (r.matchAction !== 'use_code' || !r.matchedUserId) {
          if (!pending.has(r.employeeCode) && r.matchedUserId) pending.set(r.employeeCode, r.matchedUserId);
          else if (!pending.has(r.employeeCode)) pending.set(r.employeeCode, '');
        }
      }
      setMapPicks(Object.fromEntries(pending));
      setMapOpen(pending.size > 0);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      showToast({
        title: 'Preview failed',
        message: ax.response?.data?.error || 'Could not read file',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  function applyStaffToCode(employeeCode: string, userId: string | null) {
    const person = userId ? staff.find((s) => s.id === userId) : null;
    setRows((prev) =>
      prev.map((r) => {
        if (r.employeeCode !== employeeCode) return r;
        if (!userId) {
          return { ...r, matchedUserId: null, matchedUserName: null, matchAction: 'unresolved' };
        }
        return {
          ...r,
          matchedUserId: userId,
          matchedUserName: person?.name ?? r.matchedUserName,
          matchAction: 'manual' as const,
          errors: r.errors.filter(
            (e) => !/employeeCode|No staff|Multiple staff|pick manually|Missing User ID/i.test(e)
          ),
        };
      })
    );
  }

  function patchRow(rowIndex: number, patch: Partial<StagedRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowIndex !== rowIndex) return r;
        const next = { ...r, ...patch };
        if (patch.matchedUserId) {
          const person = staff.find((s) => s.id === patch.matchedUserId);
          next.matchedUserName = person?.name ?? next.matchedUserName;
          next.matchAction = 'manual';
          next.errors = next.errors.filter(
            (e) => !/employeeCode|No staff|Multiple staff|pick manually/i.test(e)
          );
        }
        return next;
      })
    );
  }

  function applyMappingPopup() {
    const used = new Set<string>();
    for (const [code, userId] of Object.entries(mapPicks)) {
      if (!userId) continue;
      if (used.has(userId)) {
        showToast({
          title: 'Conflicting mapping',
          message: 'Same staff cannot map to two biometric User IDs in one import.',
          variant: 'error',
        });
        return;
      }
      used.add(userId);
      applyStaffToCode(code, userId);
    }
    setMapOpen(false);
  }

  async function confirm() {
    if (!readyCount) {
      showToast({ title: 'Nothing ready', message: 'Resolve unmatched rows first.', variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{
        upserted: number;
        skipped: number;
        flagged: number;
        bioPresentUpdated: number;
        failed: { rowIndex: number; error: string }[];
      }>('/attendance/biometric/confirm', { rows, writeEmployeeCodes: true });
      showToast({
        title: 'Biometric import finished',
        message: `Saved ${data.upserted} day(s). Flagged ${data.flagged} deviation(s). Updated bio on ${data.bioPresentUpdated} attendance row(s). Failed ${data.failed.length}.`,
        variant: data.failed.length ? 'error' : 'success',
      });
      if (!data.failed.length) {
        setRows([]);
        setSummary(null);
      }
      await loadReview();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      showToast({
        title: 'Confirm failed',
        message: ax.response?.data?.error || 'Import failed',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  async function approveBioOut(biometricDayId: string) {
    setBusy(true);
    try {
      await api.post('/attendance/biometric/apply-out', { biometricDayId });
      showToast({ message: 'Bio Out applied to attendance', variant: 'success' });
      await loadReview();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      showToast({
        title: 'Approve failed',
        message: ax.response?.data?.error || 'Could not apply Bio Out',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!rows.length) return;
    setSummary({
      total: rows.length,
      ready: rows.filter(rowReady).length,
      blocked: rows.length - rows.filter(rowReady).length,
    });
  }, [rows]);

  return (
    <AppPageContainer>
      <PageHeader
        title="Biometric attendance import"
        description="One place: upload monthly device export → map User IDs → confirm → reconcile app vs bio → approve forgotten logouts for food claims."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/attendance">Back</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/settings?tab=firm">Deviation setting</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void downloadTemplate()}>
              Download template
            </Button>
          </div>
        }
      />

      <PanelCard title="Upload">
        <p className="mb-2 text-sm text-muted-foreground">
          Device export (.xlsx or .csv). Shift = Bio In, In = Bio Out, OT = hours. Save .xls as .xlsx first.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        {summary ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {summary.total} rows · {readyCount} ready · {summary.total - readyCount} blocked
          </p>
        ) : null}
      </PanelCard>

      {rows.length > 0 ? (
        <PanelCard
          title="Staging"
          action={
            <div className="flex flex-wrap gap-2">
              {needsMap.length > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setMapOpen(true)}>
                  Map employees ({needsMap.length})
                </Button>
              ) : null}
              <Button type="button" size="sm" disabled={busy || readyCount === 0} onClick={() => void confirm()}>
                Confirm import ({readyCount})
              </Button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Row</th>
                  <th className="p-2">Bio ID / Name</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">In / Out</th>
                  <th className="p-2">Matched staff</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.rowIndex}-${row.employeeCode}-${row.date}`} className="border-b align-top">
                    <td className="p-2 tabular-nums">{row.rowIndex}</td>
                    <td className="p-2">
                      <div className="font-medium">{row.bioName || '—'}</div>
                      <div className="text-xs text-muted-foreground">ID {row.employeeCode || '—'}</div>
                    </td>
                    <td className="p-2 tabular-nums">{row.date || '—'}</td>
                    <td className="p-2 tabular-nums">
                      {row.inTime || '—'} → {row.outTime || '—'}
                      {row.workHrs ? (
                        <div className="text-xs text-muted-foreground">{row.workHrs}</div>
                      ) : null}
                    </td>
                    <td className="p-2 min-w-[12rem]">
                      <SearchableSelect
                        aria-label="Matched staff"
                        value={row.matchedUserId || ''}
                        emptyLabel="Select staff…"
                        placeholder="Search staff…"
                        onChange={(id) => patchRow(row.rowIndex, { matchedUserId: id || null })}
                        options={staff.map((s) => ({
                          value: s.id,
                          label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                        }))}
                      />
                      {row.warnings.map((w) => (
                        <div key={w} className="mt-1 text-xs text-muted-foreground">
                          {w}
                        </div>
                      ))}
                    </td>
                    <td className="p-2">
                      {rowReady(row) ? (
                        <Badge variant="default">
                          {row.matchAction === 'use_code' ? 'Code' : row.matchAction === 'use_name' ? 'Name' : 'Manual'}
                        </Badge>
                      ) : (
                        <div className="space-y-1">
                          <Badge variant="destructive">Blocked</Badge>
                          {row.errors.map((e) => (
                            <div key={e} className="text-xs text-destructive">
                              {e}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      ) : null}

      <PanelCard
        title="Reconcile & approve"
        action={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              From
              <input
                type="date"
                className="input-field ml-1 h-8"
                value={reviewRange.from}
                onChange={(e) => setReviewRange((r) => ({ ...r, from: e.target.value }))}
              />
            </label>
            <label className="text-xs">
              To
              <input
                type="date"
                className="input-field ml-1 h-8"
                value={reviewRange.to}
                onChange={(e) => setReviewRange((r) => ({ ...r, to: e.target.value }))}
              />
            </label>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void loadReview()}>
              Refresh
            </Button>
          </div>
        }
      >
        {review.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mismatches or forgotten logouts in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Date</th>
                  <th className="p-2">Staff</th>
                  <th className="p-2">App</th>
                  <th className="p-2">Bio</th>
                  <th className="p-2">Final</th>
                  <th className="p-2">Validation</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {review.map((r) => (
                  <tr key={r.biometricDayId} className="border-b align-top">
                    <td className="p-2 tabular-nums">{r.date}</td>
                    <td className="p-2">
                      <div className="font-medium">{r.staffName || r.bioName}</div>
                      <div className="text-xs text-muted-foreground">ID {r.employeeCode}</div>
                    </td>
                    <td className="p-2 tabular-nums">
                      {r.appIn || '—'} → {r.appOut || '—'}
                    </td>
                    <td className="p-2 tabular-nums">
                      {r.bioIn || '—'} → {r.bioOut || '—'}
                      {r.bioHrs ? <div className="text-xs text-muted-foreground">{r.bioHrs}</div> : null}
                    </td>
                    <td className="p-2 tabular-nums">
                      {r.finalIn || '—'} → {r.finalOut || '—'}
                      <div className="text-xs text-muted-foreground">
                        {r.finalHrs || '—'} · {r.finalBasis}
                      </div>
                    </td>
                    <td className="p-2">
                      <Badge variant={r.validation === 'review' ? 'secondary' : 'destructive'}>
                        {r.validation}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {r.canApplyBioOut ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => void approveBioOut(r.biometricDayId)}
                        >
                          Approve Bio Out
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Map biometric User IDs</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {needsMap.map((b) => (
              <div key={b.employeeCode} className="grid gap-1 sm:grid-cols-[1fr_1.2fr] sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.bioName || '—'}</p>
                  <p className="text-xs text-muted-foreground">User ID {b.employeeCode}</p>
                </div>
                <SearchableSelect
                  aria-label={`Map ${b.employeeCode}`}
                  value={mapPicks[b.employeeCode] || b.matchedUserId || ''}
                  emptyLabel="Select staff…"
                  placeholder="Search staff…"
                  onChange={(id) =>
                    setMapPicks((prev) => ({ ...prev, [b.employeeCode]: id || '' }))
                  }
                  options={staff.map((s) => ({
                    value: s.id,
                    label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                  }))}
                />
              </div>
            ))}
            {needsMap.length === 0 ? (
              <p className="text-sm text-muted-foreground">All User IDs already mapped.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMapOpen(false)}>
              Later
            </Button>
            <Button type="button" disabled={needsMap.length === 0} onClick={applyMappingPopup}>
              Apply mappings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPageContainer>
  );
}
