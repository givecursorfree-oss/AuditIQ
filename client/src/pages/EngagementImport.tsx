import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import { PanelCard } from '../components/layout/PanelCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppToast } from '@/context/AppToastContext';

type StagedRow = {
  rowIndex: number;
  clientName: string;
  title: string;
  type: string;
  financialYear: string;
  partnerEmail: string;
  managerEmail: string;
  clientAction: 'use_existing' | 'create_new' | 'unresolved';
  matchedClientId?: string | null;
  matchedClientName?: string | null;
  partnerId?: string | null;
  managerId?: string | null;
  engagementDupAction: 'skip' | 'create_anyway' | 'unresolved';
  duplicateEngagementTitle?: string | null;
  errors: string[];
  warnings: string[];
};

function rowReady(row: StagedRow): boolean {
  if (row.errors.length) return false;
  if (!row.partnerId || !row.managerId) return false;
  if (row.clientAction === 'unresolved') return false;
  if (row.clientAction === 'use_existing' && !row.matchedClientId) return false;
  if (row.engagementDupAction === 'unresolved' || row.engagementDupAction === 'skip') return false;
  return true;
}

export default function EngagementImportPage() {
  const { showToast } = useAppToast();
  const [rows, setRows] = useState<StagedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ total: number; ready: number; blocked: number } | null>(null);

  const readyCount = useMemo(() => rows.filter(rowReady).length, [rows]);

  async function downloadTemplate() {
    const res = await api.get('/engagements/import/template', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'engagement-import-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<{ rows: StagedRow[]; summary: { total: number; ready: number; blocked: number } }>(
        '/engagements/import/preview',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setRows(data.rows);
      setSummary(data.summary);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      showToast({ title: 'Preview failed', message: ax.response?.data?.error || 'Could not stage file', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function patchRow(rowIndex: number, patch: Partial<StagedRow>) {
    setRows((prev) => prev.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r)));
  }

  async function confirm() {
    const toImport = rows.filter(rowReady);
    if (!toImport.length) {
      showToast({ title: 'Nothing ready', message: 'Resolve staging errors first.', variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{
        created: number;
        clientsCreated: number;
        skipped: number;
        failed: { rowIndex: number; error: string }[];
      }>('/engagements/import/confirm', { rows });
      showToast({
        title: 'Import finished',
        message: `Created ${data.created} engagement(s), ${data.clientsCreated} client(s). Skipped ${data.skipped}. Failed ${data.failed.length}.`,
        variant: data.failed.length ? 'error' : 'success',
      });
      if (!data.failed.length) {
        setRows([]);
        setSummary(null);
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      showToast({ title: 'Confirm failed', message: ax.response?.data?.error || 'Import failed', variant: 'error' });
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
        title="Bulk import engagements"
        description="Upload → stage → resolve clients / duplicates / team → confirm"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/engagements">Back</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void downloadTemplate()}>
              Download template
            </Button>
          </div>
        }
      />

      <PanelCard title="Upload">
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
            <Button type="button" size="sm" disabled={busy || readyCount === 0} onClick={() => void confirm()}>
              Confirm import ({readyCount})
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Row</th>
                  <th className="p-2">Client</th>
                  <th className="p-2">Engagement</th>
                  <th className="p-2">Partner / Manager</th>
                  <th className="p-2">Actions</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowIndex} className="border-b align-top">
                    <td className="p-2 tabular-nums">{row.rowIndex}</td>
                    <td className="p-2">
                      <div className="font-medium">{row.clientName || '—'}</div>
                      {row.matchedClientName ? (
                        <div className="text-xs text-muted-foreground">Match: {row.matchedClientName}</div>
                      ) : null}
                      <select
                        className="mt-1 w-full rounded border border-border bg-background px-1 py-1 text-xs"
                        value={row.clientAction}
                        onChange={(e) =>
                          patchRow(row.rowIndex, {
                            clientAction: e.target.value as StagedRow['clientAction'],
                          })
                        }
                      >
                        <option value="use_existing">Use existing</option>
                        <option value="create_new">Create new</option>
                        <option value="unresolved">Unresolved</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <div>{row.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.type} · FY {row.financialYear}
                      </div>
                      {row.duplicateEngagementTitle ? (
                        <div className="mt-1 space-y-1">
                          <Badge variant="outline">Duplicate: {row.duplicateEngagementTitle}</Badge>
                          <select
                            className="w-full rounded border border-border bg-background px-1 py-1 text-xs"
                            value={row.engagementDupAction}
                            onChange={(e) =>
                              patchRow(row.rowIndex, {
                                engagementDupAction: e.target.value as StagedRow['engagementDupAction'],
                              })
                            }
                          >
                            <option value="unresolved">Choose…</option>
                            <option value="skip">Skip</option>
                            <option value="create_anyway">Create anyway</option>
                          </select>
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2 text-xs">
                      <div>{row.partnerEmail || '—'}</div>
                      <div>{row.managerEmail || '—'}</div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {row.warnings.map((w) => (
                        <div key={w}>{w}</div>
                      ))}
                    </td>
                    <td className="p-2">
                      {rowReady(row) ? (
                        <Badge variant="default">Ready</Badge>
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
    </AppPageContainer>
  );
}
