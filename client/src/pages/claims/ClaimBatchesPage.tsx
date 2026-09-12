import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import api from '@/services/api';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import PageLoading from '@/components/layout/PageLoading';
import { EmptyState } from '@/components/layout/EmptyState';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  BATCH_HISTORY_FILTERS,
  CLAIM_TYPE_LABELS,
  batchMatchesHistoryFilter,
  batchRef,
  batchStatusDisplay,
  claimDetailPath,
  formatInr,
  isBatchAwaitingPartner,
  receiptDownloadUrl,
  type BatchHistoryFilter,
  type StaffClaimRow,
} from '@/lib/expenseClaims';
import { useAuth } from '@/context/AuthContext';
import { apiAbsoluteUrl } from '@/lib/apiBase';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { appToast } from '@/context/AppToastContext';
import { formatApiError } from '@/lib/apiErrors';

interface BatchRow {
  id: string;
  label: string;
  status: string;
  claimCount: number;
  totalAmount: number;
  createdAt?: string;
  partnerApprovedAt?: string | null;
  createdBy?: { firstName: string; lastName: string };
  partnerApprovedBy?: { firstName: string; lastName: string } | null;
  claims?: StaffClaimRow[];
}

type FilterMode = 'manual' | 'day' | 'range';

function expenseDay(iso: string): string {
  return iso.slice(0, 10);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ClaimBatchesPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const isAccounts = ['Accounts', 'Partner', 'Admin'].includes(user?.role ?? '');
  const isPartner = ['Partner', 'Admin'].includes(user?.role ?? '');
  const canCreate = ['Partner', 'Admin', 'Manager'].includes(user?.role ?? '');
  const defaultHistory: BatchHistoryFilter = isPartner ? 'pending_approval' : 'sent';

  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [approved, setApproved] = useState<StaffClaimRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLabel, setBatchLabel] = useState('');
  const [paymentRefs, setPaymentRefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<FilterMode>('manual');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [historyFilter, setHistoryFilter] = useState<BatchHistoryFilter>(defaultHistory);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const b = await api.get<{ batches: BatchRow[] }>('/claim-batches');
      setBatches(b.data.batches);
      if (canCreate) {
        const a = await api.get<{ claims: StaffClaimRow[] }>('/expense-claims/approved');
        setApproved(a.data.claims);
      } else {
        setApproved([]);
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const matchingIds = useMemo(() => {
    if (filterMode === 'day') {
      return new Set(approved.filter((c) => expenseDay(c.expenseDate) === day).map((c) => c.id));
    }
    if (filterMode === 'range' && dateFrom && dateTo) {
      return new Set(
        approved
          .filter((c) => {
            const d = expenseDay(c.expenseDate);
            return d >= dateFrom && d <= dateTo;
          })
          .map((c) => c.id)
      );
    }
    return null;
  }, [approved, filterMode, day, dateFrom, dateTo]);

  useEffect(() => {
    if (matchingIds) setSelected(matchingIds);
  }, [matchingIds]);

  const filteredBatches = useMemo(
    () => batches.filter((b) => batchMatchesHistoryFilter(b.status, historyFilter)),
    [batches, historyFilter]
  );

  const historyCounts = useMemo(() => {
    const counts: Record<BatchHistoryFilter, number> = {
      all: batches.length,
      sent: 0,
      pending_approval: 0,
      approved: 0,
      rejected: 0,
    };
    for (const b of batches) {
      if (batchMatchesHistoryFilter(b.status, 'sent')) counts.sent += 1;
      if (batchMatchesHistoryFilter(b.status, 'pending_approval')) counts.pending_approval += 1;
      if (batchMatchesHistoryFilter(b.status, 'approved')) counts.approved += 1;
      if (batchMatchesHistoryFilter(b.status, 'rejected')) counts.rejected += 1;
    }
    return counts;
  }, [batches]);

  async function createBatch() {
    if (!batchLabel.trim() || selected.size === 0) return;
    try {
      await api.post('/claim-batches', {
        label: batchLabel.trim(),
        claimIds: [...selected],
        mode: filterMode,
        expenseDateFrom: filterMode === 'day' ? day : filterMode === 'range' ? dateFrom : undefined,
        expenseDateTo: filterMode === 'day' ? day : filterMode === 'range' ? dateTo : undefined,
      });
      setSelected(new Set());
      setBatchLabel('');
      setHistoryFilter(isPartner ? 'pending_approval' : 'sent');
      appToast({ message: 'Batch sent for approval', variant: 'success' });
      void load();
    } catch (e) {
      void appAlert({ title: 'Create failed', message: formatApiError(e) });
    }
  }

  async function partnerApprove(id: string) {
    try {
      await api.patch(`/claim-batches/${id}/partner-approve`, {});
      appToast({ message: 'Batch approved', variant: 'success' });
      void load();
    } catch (e) {
      void appAlert({ title: 'Approve failed', message: formatApiError(e) });
    }
  }

  async function partnerReject(id: string) {
    if (!rejectReason.trim()) return;
    const ok = await appConfirm({
      title: 'Reject batch',
      message: 'Reject this batch and return claims to unprocessed?',
      confirmLabel: 'Reject',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.patch(`/claim-batches/${id}/partner-reject`, { reason: rejectReason.trim() });
      setRejectId(null);
      setRejectReason('');
      appToast({ message: 'Batch rejected', variant: 'success' });
      void load();
    } catch (e) {
      void appAlert({ title: 'Reject failed', message: formatApiError(e) });
    }
  }

  async function accountsApprove(id: string) {
    try {
      await api.patch(`/claim-batches/${id}/accounts-approve`, {});
      void load();
    } catch (e) {
      void appAlert({ title: 'Approve failed', message: formatApiError(e) });
    }
  }

  async function markPaid(id: string) {
    try {
      await api.patch(`/claim-batches/${id}/mark-paid`, { paymentRef: paymentRefs[id] ?? '' });
      void load();
    } catch (e) {
      void appAlert({ title: 'Mark paid failed', message: formatApiError(e) });
    }
  }

  if (loading) {
    if (embedded) return <PageLoading />;
    return (
      <AppPageContainer>
        <PageHeader title="Claim batches" />
        <PageLoading />
      </AppPageContainer>
    );
  }

  const body = (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {canCreate && (
        <PanelCard title="Create batch">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Selection mode">
              <Button size="sm" variant={filterMode === 'manual' ? 'default' : 'outline'} onClick={() => setFilterMode('manual')}>
                Manual
              </Button>
              <Button size="sm" variant={filterMode === 'day' ? 'default' : 'outline'} onClick={() => setFilterMode('day')}>
                Single day
              </Button>
              <Button size="sm" variant={filterMode === 'range' ? 'default' : 'outline'} onClick={() => setFilterMode('range')}>
                Date range
              </Button>
            </div>
            {filterMode === 'day' && (
              <div>
                <Label htmlFor="batch-day">Date</Label>
                <Input id="batch-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </div>
            )}
            {filterMode === 'range' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="batch-from">From</Label>
                  <Input id="batch-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="batch-to">To</Label>
                  <Input id="batch-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
            )}
            {approved.length === 0 ? (
              <EmptyState
                title="No approved claims ready to batch"
                description="Fully approved claims ready for partner/accounts batching will appear here."
                illustration="box-zero"
                className="py-6"
              />
            ) : (
              <ul className="max-h-64 overflow-y-auto space-y-1 rounded-md border border-border p-2">
                {approved.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2 text-sm min-h-10 px-1">
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={(v) => {
                          if (filterMode !== 'manual') setFilterMode('manual');
                          const n = new Set(selected);
                          if (v) n.add(c.id);
                          else n.delete(c.id);
                          setSelected(n);
                        }}
                      />
                      <span>
                        {c.staff.firstName} {c.staff.lastName} · {CLAIM_TYPE_LABELS[c.claimType] ?? c.claimType} ·{' '}
                        {expenseDay(c.expenseDate)} · {formatInr(c.approvedAmount ?? c.amount)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <Label htmlFor="batch-label">Batch label</Label>
              <Input id="batch-label" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} />
            </div>
            <Button size="sm" disabled={!batchLabel.trim() || selected.size === 0} onClick={() => void createBatch()}>
              Send for approval
            </Button>
          </div>
        </PanelCard>
      )}

      <PanelCard title="Batch history">
        <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Batch history">
          {BATCH_HISTORY_FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={historyFilter === f.id ? 'default' : 'outline'}
              role="tab"
              aria-selected={historyFilter === f.id}
              onClick={() => setHistoryFilter(f.id)}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums text-[11px] opacity-80">{historyCounts[f.id]}</span>
            </Button>
          ))}
        </div>

        {filteredBatches.length === 0 ? (
          <EmptyState
            title="No batches in this view"
            description="Create a batch or switch history filter."
            illustration="doc-list"
            className="py-6"
          />
        ) : (
          <ul className="divide-y text-sm">
            {filteredBatches.map((b) => {
              const open = Boolean(expanded[b.id]);
              const statusUi = batchStatusDisplay(b.status);
              return (
                <li key={b.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <button
                      type="button"
                      className="flex items-start gap-2 text-left min-w-0"
                      onClick={() => setExpanded((e) => ({ ...e, [b.id]: !e[b.id] }))}
                      aria-expanded={open}
                    >
                      {open ? <CaretDown size={14} className="mt-1 shrink-0" /> : <CaretRight size={14} className="mt-1 shrink-0" />}
                      <span className="min-w-0 space-y-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{b.label}</span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {batchRef(b.id)}
                          </Badge>
                          <Badge variant={isBatchAwaitingPartner(b.status) ? 'warning' : 'success'}>
                            {statusUi.primary}
                          </Badge>
                          {statusUi.secondary && (
                            <Badge variant="secondary" className="font-normal">
                              {statusUi.secondary}
                            </Badge>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {b.claimCount} claims · {formatInr(b.totalAmount)} · {fmtDate(b.createdAt)}
                          {b.createdBy ? ` · ${b.createdBy.firstName} ${b.createdBy.lastName}` : ''}
                          {b.partnerApprovedAt
                            ? ` · Approved ${fmtDate(b.partnerApprovedAt)}${
                                b.partnerApprovedBy
                                  ? ` by ${b.partnerApprovedBy.firstName} ${b.partnerApprovedBy.lastName}`
                                  : ''
                              }`
                            : ''}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(apiAbsoluteUrl(`/claim-batches/${b.id}/export.xlsx`), '_blank')}
                      >
                        Excel
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(apiAbsoluteUrl(`/claim-batches/${b.id}/export.pdf`), '_blank')}
                      >
                        PDF
                      </Button>
                      {isBatchAwaitingPartner(b.status) && isPartner && (
                        <>
                          <Button size="sm" variant="success" onClick={() => void partnerApprove(b.id)}>
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setRejectId(b.id);
                              setRejectReason('');
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {b.status === 'partner_approved' && isAccounts && (
                        <Button size="sm" variant="success" onClick={() => void accountsApprove(b.id)}>
                          Accounts approve
                        </Button>
                      )}
                      {b.status === 'accounts_approved' && isAccounts && (
                        <>
                          <Input
                            className="h-8 w-32"
                            aria-label="Payment reference"
                            value={paymentRefs[b.id] ?? ''}
                            onChange={(e) => setPaymentRefs((r) => ({ ...r, [b.id]: e.target.value }))}
                          />
                          <Button size="sm" variant="success" onClick={() => void markPaid(b.id)}>
                            Mark paid
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {rejectId === b.id && (
                    <div className="flex flex-wrap items-end gap-2 pl-5">
                      <div className="flex-1 min-w-[12rem]">
                        <Label htmlFor={`reject-${b.id}`}>Reason</Label>
                        <Input
                          id={`reject-${b.id}`}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!rejectReason.trim()}
                        onClick={() => void partnerReject(b.id)}
                      >
                        Confirm reject
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejectId(null)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                  {open && (
                    <ul className="ml-5 space-y-2 border-l border-border pl-3">
                      {(b.claims ?? []).map((c) => (
                        <li key={c.id} className="text-xs space-y-1 py-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              {c.staff.firstName} {c.staff.lastName} · {CLAIM_TYPE_LABELS[c.claimType] ?? c.claimType} ·{' '}
                              {formatInr(c.approvedAmount ?? c.amount)}
                            </span>
                            <Button size="sm" variant="outline" className="h-7" asChild>
                              <Link to={claimDetailPath(c.id)}>Open claim</Link>
                            </Button>
                          </div>
                          {(c.receipts?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {c.receipts.map((r) => (
                                <a
                                  key={r.id}
                                  className="underline"
                                  href={apiAbsoluteUrl(receiptDownloadUrl(r.id))}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {r.fileName}
                                </a>
                              ))}
                            </div>
                          )}
                          {c.claimType === 'travel' && (
                            <div className="text-muted-foreground">
                              {[c.jurisdiction, c.location, c.period].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>
    </div>
  );

  if (embedded) return body;

  return (
    <AppPageContainer>
      <PageHeader title="Claim batches" />
      {body}
    </AppPageContainer>
  );
}
