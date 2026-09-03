import { useEffect, useMemo, useState } from 'react';
import { Receipt, Plus, CurrencyInr, Warning, CheckCircle } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/layout/PageHeader';
import PageLoading from '../components/layout/PageLoading';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { appAlert } from '../context/AppDialogContext';

interface InvoiceRow {
  id: string;
  invoiceNo: string;
  amount: number;
  tax: number;
  totalAmount: number;
  paidAmount: number;
  status: string;
  displayStatus?: string;
  issueDate: string;
  dueDate: string;
  description?: string | null;
  client: { id: string; name: string };
  engagement?: { id: string; title: string } | null;
}

interface OutstandingSummary {
  totalOutstanding: number;
  perClient: { clientId: string; clientName: string; outstanding: number; count: number }[];
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'outline'> = {
  Paid: 'success',
  Partial: 'secondary',
  Unpaid: 'outline',
  Overdue: 'destructive',
};

export default function Billing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = ['Partner', 'Admin', 'Manager', 'Accounts'].includes(user?.role || '');

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [summary, setSummary] = useState<OutstandingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [form, setForm] = useState({
    invoiceNo: '',
    clientId: '',
    engagementId: '',
    amount: '',
    tax: '',
    dueDate: '',
    description: '',
  });
  const [payment, setPayment] = useState({ amount: '', method: 'Bank Transfer', reference: '' });
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [engagements, setEngagements] = useState<{ id: string; title: string; clientId: string }[]>([]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [invRes, sumRes] = await Promise.all([
        api.get<InvoiceRow[]>('/invoices'),
        api.get<OutstandingSummary>('/invoices/outstanding/summary').catch(() => ({ data: null })),
      ]);
      setInvoices(invRes.data);
      setSummary(sumRes.data);
    } catch {
      setInvoices([]);
      setLoadError('Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    if (canManage) {
      api.get('/clients?limit=200').then((r) => {
        const list = r.data.clients ?? r.data;
        setClients(Array.isArray(list) ? list.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : []);
      }).catch(() => setClients([]));
      api.get('/engagements?limit=100').then((r) => {
        setEngagements(
          (r.data.engagements ?? []).map((e: { id: string; title: string; client: { id: string } }) => ({
            id: e.id,
            title: e.title,
            clientId: e.client?.id ?? '',
          }))
        );
      }).catch(() => setEngagements([]));
    }
  }, [canManage]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (i) =>
        i.invoiceNo.toLowerCase().includes(q) ||
        i.client.name.toLowerCase().includes(q) ||
        i.engagement?.title?.toLowerCase().includes(q)
    );
  }, [invoices, filter]);

  const payTarget = payInvoiceId ? invoices.find((i) => i.id === payInvoiceId) : null;
  const balanceDue = payTarget ? payTarget.totalAmount - payTarget.paidAmount : 0;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/invoices', {
        invoiceNo: form.invoiceNo,
        clientId: form.clientId,
        engagementId: form.engagementId || undefined,
        amount: Number(form.amount),
        tax: Number(form.tax) || 0,
        dueDate: form.dueDate,
        description: form.description || undefined,
      });
      setShowCreate(false);
      setForm({ invoiceNo: '', clientId: '', engagementId: '', amount: '', tax: '', dueDate: '', description: '' });
      await load();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      void appAlert({ title: 'Invoice failed', message: ax.response?.data?.error || 'Failed to create invoice' });
    }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payInvoiceId) return;
    try {
      await api.post(`/invoices/${payInvoiceId}/payments`, {
        amount: Number(payment.amount),
        method: payment.method,
        reference: payment.reference || undefined,
      });
      setPayInvoiceId(null);
      setPayment({ amount: '', method: 'Bank Transfer', reference: '' });
      await load();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      void appAlert({ title: 'Payment failed', message: ax.response?.data?.error || 'Failed to record payment' });
    }
  }

  if (loading) {
    return <PageLoading />;
  }

  return (
    <AppPageContainer className="space-y-6">
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      <PageHeader
        title="Billing & Invoices"
        description="WIP to bill to collect — GST on professional fees, payments, and aging."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate('/billing/pending')}>
                Pending billing
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus size={18} className="mr-2" />
                New invoice
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center">
              <CurrencyInr size={22} className="text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground-secondary">Total outstanding</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">
                ₹{(summary?.totalOutstanding ?? 0).toLocaleString('en-IN')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Warning size={22} className="text-warning" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground-secondary">Unpaid / overdue</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">
                {invoices.filter((i) => (i.displayStatus || i.status) !== 'Paid').length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckCircle size={22} className="text-success" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground-secondary">Collected (listed)</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">
                ₹{invoices.reduce((s, i) => s + i.paidAmount, 0).toLocaleString('en-IN')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {summary && summary.perClient.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aging by client</CardTitle>
            <CardDescription>Top outstanding balances</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.perClient.slice(0, 6).map((c) => (
              <div key={c.clientId} className="rounded-lg border border-border p-3 bg-card">
                <p className="font-medium text-foreground text-sm truncate">{c.clientName}</p>
                <p className="text-lg font-bold text-foreground tabular-nums">
                  ₹{c.outstanding.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-foreground-muted">{c.count} open invoice(s)</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt size={18} className="text-primary" />
              All invoices
            </CardTitle>
          </div>
          <input
            type="search"
            placeholder="Search invoice, client…"
            aria-label="Search invoices"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input-field max-w-xs"
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => {
                const status = inv.displayStatus || inv.status;
                const balance = inv.totalAmount - inv.paidAmount;
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium font-data text-sm">{inv.invoiceNo}</TableCell>
                    <TableCell>{inv.client.name}</TableCell>
                    <TableCell className="text-sm text-foreground-secondary">
                      {inv.engagement ? (
                        <button
                          type="button"
                          className="text-primary hover:underline text-left"
                          onClick={() => navigate(`/engagements/${inv.engagement!.id}`)}
                        >
                          {inv.engagement.title}
                        </button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(inv.dueDate).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₹{inv.totalAmount.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      ₹{balance.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && balance > 0 && (
                        <Button size="sm" variant="outline" onClick={() => setPayInvoiceId(inv.id)}>
                          Record payment
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-foreground-muted">
                    No invoices yet. Create one from an engagement or use New invoice.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleCreate} className="modal-panel w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">New invoice</h2>
            <div className="form-grid-2">
              <label className="col-span-2 text-sm">
                Invoice no.
                <input className="input-field mt-1" required value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
              </label>
              <label className="col-span-2 text-sm">
                Client
                <select className="input-field mt-1" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                  <option value="">Select client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 text-sm">
                Engagement (optional)
                <select className="input-field mt-1" value={form.engagementId} onChange={(e) => setForm({ ...form, engagementId: e.target.value })}>
                  <option value="">None</option>
                  {engagements.filter((e) => !form.clientId || e.clientId === form.clientId).map((e) => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Amount (ex-GST)
                <input type="number" className="input-field mt-1" required min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </label>
              <label className="text-sm">
                GST
                <input type="number" className="input-field mt-1" min={0} value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
              </label>
              <label className="col-span-2 text-sm">
                Due date
                <input type="date" className="input-field mt-1" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit">Create</Button>
            </div>
          </form>
        </div>
      )}

      {payInvoiceId && payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handlePayment} className="modal-panel w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Record payment</h2>
            <p className="text-sm text-foreground-muted">
              {payTarget.invoiceNo} — balance ₹{balanceDue.toLocaleString('en-IN')}
            </p>
            <label className="text-sm block">
              Amount
              <input type="number" className="input-field mt-1" required min={0.01} max={balanceDue} step={0.01} value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
            </label>
            <label className="text-sm block">
              Method
              <select className="input-field mt-1" value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                <option>Bank Transfer</option>
                <option>UPI</option>
                <option>Cheque</option>
                <option>Cash</option>
              </select>
            </label>
            <label className="text-sm block">
              Reference
              <input className="input-field mt-1" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPayInvoiceId(null)}>Cancel</Button>
              <Button type="submit">Save payment</Button>
            </div>
          </form>
        </div>
      )}
    </AppPageContainer>
  );
}
