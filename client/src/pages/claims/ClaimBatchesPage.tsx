import { useEffect, useState } from 'react';
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
import { formatInr, type StaffClaimRow } from '@/lib/expenseClaims';
import { useAuth } from '@/context/AuthContext';
import { apiAbsoluteUrl } from '@/lib/apiBase';
import { appAlert } from '@/context/AppDialogContext';
import { formatApiError } from '@/lib/apiErrors';

interface BatchRow {
  id: string;
  label: string;
  status: string;
  claimCount: number;
  totalAmount: number;
  claims?: StaffClaimRow[];
}

export default function ClaimBatchesPage() {
  const { user } = useAuth();
  const isAccounts = ['Accounts', 'Partner', 'Admin'].includes(user?.role ?? '');
  const canCreate = ['Partner', 'Admin', 'Manager'].includes(user?.role ?? '');
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [approved, setApproved] = useState<StaffClaimRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLabel, setBatchLabel] = useState('');
  const [paymentRefs, setPaymentRefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function createBatch() {
    if (!batchLabel.trim() || selected.size === 0) return;
    try {
      await api.post('/claim-batches', { label: batchLabel.trim(), claimIds: [...selected] });
      setSelected(new Set());
      setBatchLabel('');
      void load();
    } catch (e) {
      void appAlert({ title: 'Create failed', message: formatApiError(e) });
    }
  }

  async function partnerApprove(id: string) {
    try {
      await api.patch(`/claim-batches/${id}/partner-approve`, {});
      void load();
    } catch (e) {
      void appAlert({ title: 'Approve failed', message: formatApiError(e) });
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
    return (
      <AppPageContainer>
        <PageHeader title="Claim batches" />
        <PageLoading />
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer>
      <PageHeader title="Claim batches" />
      {error && <ErrorBanner message={error} onRetry={() => void load()} className="mb-3" />}
      {canCreate && (
        <PanelCard title="Create batch">
          <div className="space-y-2 max-w-xl">
            {approved.length === 0 ? (
              <EmptyState title="No approved claims ready to batch" className="py-6" />
            ) : (
              approved.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={(v) => {
                    const n = new Set(selected);
                    if (v) n.add(c.id); else n.delete(c.id);
                    setSelected(n);
                  }} />
                  <span>{c.staff.firstName} {c.staff.lastName} · {formatInr(c.approvedAmount ?? c.amount)}</span>
                </label>
              ))
            )}
            <div>
              <Label>Batch label</Label>
              <Input value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} />
            </div>
            <Button size="sm" onClick={() => void createBatch()}>Create batch</Button>
          </div>
        </PanelCard>
      )}
      <PanelCard title="Batches">
        {batches.length === 0 ? (
          <EmptyState title="No batches yet" className="py-6" />
        ) : (
          <ul className="divide-y text-sm">
            {batches.map((b) => (
              <li key={b.id} className="py-3 flex flex-wrap justify-between gap-2">
                <span>{b.label} · {b.claimCount} claims · {formatInr(b.totalAmount)} · {b.status}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { window.open(apiAbsoluteUrl(`/claim-batches/${b.id}/export.csv`), '_blank'); }}>
                    Excel
                  </Button>
                  {b.status === 'draft' && ['Partner', 'Admin'].includes(user?.role ?? '') && (
                    <Button size="sm" variant="success" onClick={() => void partnerApprove(b.id)}>Partner approve</Button>
                  )}
                  {b.status === 'partner_approved' && isAccounts && (
                    <Button size="sm" variant="success" onClick={() => void accountsApprove(b.id)}>Accounts approve</Button>
                  )}
                  {b.status === 'accounts_approved' && isAccounts && (
                    <>
                      <Input
                        className="h-8 w-32"
                        value={paymentRefs[b.id] ?? ''}
                        onChange={(e) => setPaymentRefs((r) => ({ ...r, [b.id]: e.target.value }))}
                      />
                      <Button size="sm" variant="success" onClick={() => void markPaid(b.id)}>Mark paid</Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </AppPageContainer>
  );
}
