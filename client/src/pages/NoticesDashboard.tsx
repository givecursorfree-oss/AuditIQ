import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { PanelCard } from '../components/layout/PanelCard';
import PageHeader from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { appAlert } from '../context/AppDialogContext';
import { formatApiError } from '@/lib/apiErrors';

type ClientOpt = { id: string; name: string; gstin?: string | null };

type GstNotice = {
  id: string;
  noticeOrderId: string;
  importOrder: number;
  type: string | null;
  description: string | null;
  issueDate: string | null;
  dueDate: string | null;
  dueKind: string;
  period: string | null;
  primaryStatus: string;
  appStatus: string;
  customStatus: string | null;
  followUp: string;
  customFollowUp: string | null;
  followUpLabel: string | null;
  followUpDueDate: string | null;
  assignedTo: string | null;
  notes: string | null;
  viewState: string;
  version: number;
  autoStatusPreview: string;
};

type ImportResult = {
  gstin: string | null;
  gstinValid: boolean | null;
  gstinMatchedClient: boolean;
  sheetName: string | null;
  partial: boolean;
  rowsRead: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: { rowIndex: number; reason: string }[];
};

const APP_STATUSES = [
  'Auto',
  'Responded',
  'Drop order received',
  'Demand order received',
  'Just FYI',
  'Custom',
] as const;
const FOLLOW_UPS = ['None', 'Appeal', 'Payment', 'Hearing', 'Custom'] as const;

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { timeZone: 'UTC' });
}

function dueDisplay(n: GstNotice): string {
  if (n.dueKind === 'not_applicable') return 'Not applicable';
  if (n.dueKind === 'unclear') return 'Due unclear';
  return fmtDate(n.dueDate);
}

function viewBadge(state: string) {
  if (state === 'New') return <Badge className="bg-sky-600/15 text-sky-800 border-0">New</Badge>;
  if (state === 'Updated') return <Badge className="bg-amber-500/15 text-amber-800 border-0">Updated</Badge>;
  return <Badge variant="outline">Seen</Badge>;
}

export default function NoticesDashboard() {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientId, setClientId] = useState('');
  const [notices, setNotices] = useState<GstNotice[]>([]);
  const [lastPortalCheckAt, setLastPortalCheckAt] = useState<string | null>(null);
  const [dataComplete, setDataComplete] = useState(false);
  const [clientMeta, setClientMeta] = useState<ClientOpt | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<'order' | 'issue' | 'due' | 'id'>('order');
  const [edit, setEdit] = useState<GstNotice | null>(null);
  const [editForm, setEditForm] = useState({
    type: '',
    period: '',
    issueDate: '',
    dueDate: '',
    dueKind: 'unclear' as 'date' | 'not_applicable' | 'unclear',
    description: '',
    appStatus: 'Auto' as (typeof APP_STATUSES)[number],
    customStatus: '',
    followUp: 'None' as (typeof FOLLOW_UPS)[number],
    customFollowUp: '',
    followUpDueDate: '',
    assignedTo: '',
    notes: '',
    editedBy: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ clients?: ClientOpt[] }>('/clients?limit=2000')
      .then((r) => setClients(r.data.clients || []))
      .catch(() => setClients([]));
  }, []);

  const loadNotices = useCallback(async (id: string) => {
    if (!id) {
      setNotices([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get<{
        client: ClientOpt & { gstNoticeLastImportAt?: string | null; gstNoticeDataComplete?: boolean };
        lastPortalCheckAt: string | null;
        dataComplete: boolean;
        notices: GstNotice[];
      }>(`/gst-notices?clientId=${encodeURIComponent(id)}`);
      setClientMeta(data.client);
      setLastPortalCheckAt(data.lastPortalCheckAt);
      setDataComplete(data.dataComplete);
      setNotices(data.notices);
    } catch (e) {
      setLoadError(formatApiError(e));
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotices(clientId);
  }, [clientId, loadNotices]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = notices;
    if (q) {
      list = list.filter(
        (n) =>
          n.noticeOrderId.toLowerCase().includes(q) ||
          (n.type || '').toLowerCase().includes(q) ||
          (n.description || '').toLowerCase().includes(q) ||
          (n.period || '').toLowerCase().includes(q) ||
          (n.assignedTo || '').toLowerCase().includes(q) ||
          (n.primaryStatus || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sortKey === 'id') sorted.sort((a, b) => a.noticeOrderId.localeCompare(b.noticeOrderId));
    else if (sortKey === 'issue')
      sorted.sort((a, b) => String(a.issueDate || '').localeCompare(String(b.issueDate || '')));
    else if (sortKey === 'due')
      sorted.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    else sorted.sort((a, b) => a.importOrder - b.importOrder);
    return sorted;
  }, [notices, filter, sortKey]);

  async function onImport(file: File | null) {
    if (!clientId || !file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('clientId', clientId);
      const { data } = await api.post<ImportResult>('/gst-notices/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(data);
      await loadNotices(clientId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: ImportResult & { error?: string } } };
      if (err.response?.data?.skipped) {
        setImportResult(err.response.data);
      } else {
        await appAlert({
          title: 'Import failed',
          message: err.response?.data?.error || formatApiError(e),
        });
      }
    } finally {
      setImporting(false);
    }
  }

  function openEdit(n: GstNotice) {
    setEdit(n);
    setEditForm({
      type: n.type || '',
      period: n.period || '',
      issueDate: n.issueDate ? String(n.issueDate).slice(0, 10) : '',
      dueDate: n.dueDate ? String(n.dueDate).slice(0, 10) : '',
      dueKind: (n.dueKind as 'date' | 'not_applicable' | 'unclear') || 'unclear',
      description: n.description || '',
      appStatus: (APP_STATUSES.includes(n.appStatus as (typeof APP_STATUSES)[number])
        ? n.appStatus
        : 'Auto') as (typeof APP_STATUSES)[number],
      customStatus: n.customStatus || '',
      followUp: (FOLLOW_UPS.includes(n.followUp as (typeof FOLLOW_UPS)[number])
        ? n.followUp
        : 'None') as (typeof FOLLOW_UPS)[number],
      customFollowUp: n.customFollowUp || '',
      followUpDueDate: n.followUpDueDate ? String(n.followUpDueDate).slice(0, 10) : '',
      assignedTo: n.assignedTo || '',
      notes: n.notes || '',
      editedBy: '',
    });
  }

  async function saveEdit() {
    if (!edit) return;
    if (!editForm.editedBy.trim()) {
      await appAlert({ title: 'Edited by required', message: 'Enter who is saving this edit.' });
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch<GstNotice>(`/gst-notices/${edit.id}`, {
        version: edit.version,
        type: editForm.type || null,
        period: editForm.period || null,
        issueDate: editForm.issueDate || null,
        dueDate: editForm.dueKind === 'date' ? editForm.dueDate || null : null,
        dueKind: editForm.dueKind,
        description: editForm.description || null,
        appStatus: editForm.appStatus,
        customStatus: editForm.customStatus || null,
        followUp: editForm.followUp,
        customFollowUp: editForm.customFollowUp || null,
        followUpDueDate: editForm.followUp === 'None' ? null : editForm.followUpDueDate || null,
        assignedTo: editForm.assignedTo || null,
        notes: editForm.notes || null,
        editedBy: editForm.editedBy.trim(),
      });
      setNotices((prev) => prev.map((n) => (n.id === data.id ? data : n)));
      setEdit(null);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string; notice?: GstNotice } } };
      if (err.response?.status === 409 && err.response.data?.notice) {
        await appAlert({
          title: 'Conflict',
          message: err.response.data.error || 'Record changed. Reloading current values.',
        });
        openEdit(err.response.data.notice);
        await loadNotices(clientId);
      } else {
        await appAlert({ title: 'Save failed', message: err.response?.data?.error || formatApiError(e) });
      }
    } finally {
      setSaving(false);
    }
  }

  async function markSeen(n: GstNotice) {
    try {
      const { data } = await api.post<GstNotice>(`/gst-notices/${n.id}/seen`);
      setNotices((prev) => prev.map((x) => (x.id === data.id ? data : x)));
    } catch (e) {
      await appAlert({ title: 'Update failed', message: formatApiError(e) });
    }
  }

  return (
    <AppPageContainer>
      <PageHeader title="GST notices" />

      <PanelCard title="Client" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1">
            <span className="text-sm text-muted-foreground">Select client</span>
            <select
              className="input-field mt-1 w-full"
              aria-label="Client"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setImportResult(null);
              }}
            >
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.gstin ? ` · ${c.gstin}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Import workbook</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="input-field mt-1"
              disabled={!clientId || importing}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                void onImport(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {clientId && (
          <p className="mt-3 text-sm text-muted-foreground">
            Last portal check:{' '}
            {lastPortalCheckAt
              ? new Date(lastPortalCheckAt).toLocaleString('en-IN')
              : 'Never'}
            {' · '}
            Data: {dataComplete ? 'Complete' : 'Partial / not imported'}
            {clientMeta?.gstin ? ` · GSTIN ${clientMeta.gstin}` : ''}
          </p>
        )}
      </PanelCard>

      {importResult && (
        <PanelCard title="Import result" className="mb-4">
          <ul className="text-sm space-y-1">
            <li>
              GSTIN: {importResult.gstin || '—'}
              {importResult.gstinValid === false
                ? ' (invalid)'
                : importResult.gstinValid === true
                  ? ' (valid)'
                  : ''}
              {importResult.partial ? ' · partial workbook' : ''}
            </li>
            <li>
              Sheet: {importResult.sheetName || '—'} · Read {importResult.rowsRead} · Created{' '}
              {importResult.created} · Updated {importResult.updated} · Unchanged {importResult.unchanged} ·
              Skipped {importResult.skipped.length}
            </li>
          </ul>
          {importResult.skipped.length > 0 && (
            <ul className="mt-2 text-sm text-destructive space-y-0.5">
              {importResult.skipped.map((s) => (
                <li key={`${s.rowIndex}-${s.reason}`}>
                  Row {s.rowIndex || '—'}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      )}

      <PanelCard
        title="Notices"
        action={
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="input-field w-48"
              aria-label="Filter notices"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              disabled={!clientId}
            />
            <select
              className="input-field w-auto"
              aria-label="Sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            >
              <option value="order">Workbook order</option>
              <option value="id">Notice ID</option>
              <option value="issue">Issue date</option>
              <option value="due">Due date</option>
            </select>
          </div>
        }
      >
        {loadError && <p className="text-sm text-destructive mb-2">{loadError}</p>}
        {!clientId && <p className="text-sm text-muted-foreground">Select a client to view notices.</p>}
        {clientId && loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {clientId && !loading && notices.length === 0 && !loadError && (
          <p className="text-sm text-muted-foreground">No notices. Import a GST portal workbook.</p>
        )}
        {clientId && !loading && notices.length > 0 && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No notices match this filter.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header text-left">
                  <th className="px-2 py-2">Notice / Order ID</th>
                  <th className="px-2 py-2">Period</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2">Issue Date</th>
                  <th className="px-2 py-2">Due Date</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Assigned To</th>
                  <th className="px-2 py-2">Notes</th>
                  <th className="px-2 py-2">Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n.id} className="border-t border-border">
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {viewBadge(n.viewState)}
                        <span className="font-mono text-xs">{n.noticeOrderId}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2">{n.period || '—'}</td>
                    <td className="px-2 py-2">{n.type || '—'}</td>
                    <td className="px-2 py-2 max-w-[14rem] truncate" title={n.description || ''}>
                      {n.description || '—'}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(n.issueDate)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{dueDisplay(n)}</td>
                    <td className="px-2 py-2">
                      <div>{n.primaryStatus}</div>
                      {n.followUpLabel && (
                        <div className="text-xs text-muted-foreground">
                          Follow-up: {n.followUpLabel}
                          {n.followUpDueDate ? ` · ${fmtDate(n.followUpDueDate)}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">{n.assignedTo || '—'}</td>
                    <td className="px-2 py-2 max-w-[8rem] truncate" title={n.notes || ''}>
                      {n.notes || '—'}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap space-x-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => openEdit(n)}>
                        Edit
                      </Button>
                      {n.viewState !== 'Seen' && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => void markSeen(n)}>
                          Seen
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background border border-border rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 space-y-3">
            <h2 className="text-lg font-medium">Edit notice · {edit.noticeOrderId}</h2>
            <label className="block text-sm">
              Type
              <input
                className="input-field mt-1 w-full"
                maxLength={40}
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Period
              <input
                className="input-field mt-1 w-full"
                maxLength={12}
                value={editForm.period}
                onChange={(e) => setEditForm({ ...editForm, period: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Description
              <input
                className="input-field mt-1 w-full"
                maxLength={100}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                Issue date
                <input
                  type="date"
                  className="input-field mt-1 w-full"
                  value={editForm.issueDate}
                  onChange={(e) => setEditForm({ ...editForm, issueDate: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Due kind
                <select
                  className="input-field mt-1 w-full"
                  value={editForm.dueKind}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      dueKind: e.target.value as typeof editForm.dueKind,
                      dueDate: e.target.value === 'date' ? editForm.dueDate : '',
                    })
                  }
                >
                  <option value="date">Date</option>
                  <option value="not_applicable">Not applicable</option>
                  <option value="unclear">Due unclear</option>
                </select>
              </label>
            </div>
            {editForm.dueKind === 'date' && (
              <label className="block text-sm">
                Due date
                <input
                  type="date"
                  className="input-field mt-1 w-full"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                />
              </label>
            )}
            <label className="block text-sm">
              Status
              <select
                className="input-field mt-1 w-full"
                value={editForm.appStatus}
                onChange={(e) =>
                  setEditForm({ ...editForm, appStatus: e.target.value as typeof editForm.appStatus })
                }
              >
                {APP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {editForm.appStatus === 'Custom' && (
              <label className="block text-sm">
                Custom status
                <input
                  className="input-field mt-1 w-full"
                  maxLength={30}
                  value={editForm.customStatus}
                  onChange={(e) => setEditForm({ ...editForm, customStatus: e.target.value })}
                />
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              Preview: {editForm.appStatus === 'Auto' ? edit.autoStatusPreview : editForm.appStatus === 'Custom' ? editForm.customStatus || 'Custom' : editForm.appStatus}
            </p>
            <label className="block text-sm">
              Follow-up
              <select
                className="input-field mt-1 w-full"
                value={editForm.followUp}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    followUp: e.target.value as typeof editForm.followUp,
                    followUpDueDate: e.target.value === 'None' ? '' : editForm.followUpDueDate,
                  })
                }
              >
                {FOLLOW_UPS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {editForm.followUp === 'Custom' && (
              <label className="block text-sm">
                Custom follow-up
                <input
                  className="input-field mt-1 w-full"
                  maxLength={24}
                  value={editForm.customFollowUp}
                  onChange={(e) => setEditForm({ ...editForm, customFollowUp: e.target.value })}
                />
              </label>
            )}
            {editForm.followUp !== 'None' && (
              <label className="block text-sm">
                Follow-up due date
                <input
                  type="date"
                  className="input-field mt-1 w-full"
                  value={editForm.followUpDueDate}
                  onChange={(e) => setEditForm({ ...editForm, followUpDueDate: e.target.value })}
                />
              </label>
            )}
            <label className="block text-sm">
              Assigned To
              <input
                className="input-field mt-1 w-full"
                maxLength={40}
                value={editForm.assignedTo}
                onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Notes / Comments
              <textarea
                className="input-field mt-1 w-full"
                rows={3}
                maxLength={1000}
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Edited by
              <input
                className="input-field mt-1 w-full"
                maxLength={40}
                required
                value={editForm.editedBy}
                onChange={(e) => setEditForm({ ...editForm, editedBy: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppPageContainer>
  );
}
