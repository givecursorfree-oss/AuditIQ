import { useEffect, useState } from 'react';
import { ChartBar, Calendar, FileText, CurrencyInr, UsersThree, Download } from '@phosphor-icons/react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../services/api';
import { apiAbsoluteUrl } from '@/lib/apiBase';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import PageLoading from '../components/layout/PageLoading';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { EmptyState } from '@/components/layout/EmptyState';
import { AccessibleTabList, AccessibleTabPanel } from '@/components/ui/accessible-tabs';
import { Button } from '@/components/ui/button';

type Tab = 'profitability' | 'deadlines' | 'udin' | 'billing' | 'productivity';

export default function ManagementReports() {
  const [tab, setTab] = useState<Tab>('profitability');

  return (
    <AppPageContainer className="space-y-6">
      <PageHeader
        title="Management Reports"
        description="Partner-only insights into profitability, deadlines, and team output."
      />

      <AccessibleTabList
        idPrefix="mgmt-reports"
        ariaLabel="Management report views"
        tabs={[
          { key: 'profitability' as const, label: 'Profitability', icon: ChartBar },
          { key: 'deadlines' as const, label: 'Deadline tracker', icon: Calendar },
          { key: 'udin' as const, label: 'UDIN log', icon: FileText },
          { key: 'billing' as const, label: 'Billing & collection', icon: CurrencyInr },
          { key: 'productivity' as const, label: 'Staff productivity', icon: UsersThree },
        ]}
        active={tab}
        onChange={setTab}
      />

      <AccessibleTabPanel id={`mgmt-reports-panel-${tab}`} labelledBy={`mgmt-reports-tab-${tab}`}>
        {tab === 'profitability' && <Profitability />}
        {tab === 'deadlines' && <Deadlines />}
        {tab === 'udin' && <UdinLog />}
        {tab === 'billing' && <BillingReport />}
        {tab === 'productivity' && <StaffProductivity />}
      </AccessibleTabPanel>
    </AppPageContainer>
  );
}

function Profitability() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get('/management-reports/profitability')
      .then(r => setRows(r.data))
      .catch(() => setError('Failed to load profitability data. Please try again.'))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <PageLoading />;
  if (error) return <ErrorBanner message={error} />;
  const chart = rows.slice(0, 10).map(r => ({ name: r.title.slice(0, 18), Billed: r.feeBilled, Rate: r.effectiveHourlyRate }));
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-semibold mb-3">Top 10 by fees billed</h3>
        {chart.length === 0 ? (
          <EmptyState title="No billing data yet" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer><BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip />
              <Bar dataKey="Billed" fill="#3b82f6" />
            </BarChart></ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="table-header text-left">
            <th className="px-4 py-3">Engagement</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">FY</th>
            <th className="px-4 py-3 text-right">Total Hours</th><th className="px-4 py-3 text-right">Billable</th>
            <th className="px-4 py-3 text-right">Fee Billed</th><th className="px-4 py-3 text-right">Collected</th><th className="px-4 py-3 text-right">Rate ₹/hr</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.engagementId} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{r.title}</td>
                <td>{r.clientName}</td><td>{r.financialYear}</td>
                <td className="text-right">{r.totalHours.toFixed(1)}</td>
                <td className="text-right">{r.billableHours.toFixed(1)}</td>
                <td className="text-right">₹{r.feeBilled.toLocaleString('en-IN')}</td>
                <td className="text-right">₹{r.feeCollected.toLocaleString('en-IN')}</td>
                <td className="text-right">₹{r.effectiveHourlyRate.toLocaleString('en-IN')}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8}><EmptyState title="No engagements with billing data yet" className="py-8" /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DEADLINE_RAG: Record<string, string> = {
  red: 'bg-danger/15 text-danger border-danger/30',
  amber: 'bg-warning/15 text-warning border-warning/30',
  green: 'bg-success/15 text-success border-success/30',
};

function Deadlines() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get('/management-reports/deadline-tracker')
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load the deadline tracker. Please try again.'));
  }, []);
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;
  if (!data.items?.length) {
    return <EmptyState title="No upcoming statutory deadlines" />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {data.items.map((d: any) => (
        <div key={d.key} className={`card p-4 border-2 ${DEADLINE_RAG[d.rag]}`}>
          <div className="text-xs font-mono text-foreground-muted">{d.key}</div>
          <div className="font-semibold text-foreground">{d.title}</div>
          <div className="mt-2 text-sm">
            Due <strong>{new Date(d.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
          </div>
          <div className="text-2xl font-bold mt-2">{d.daysAway} day{d.daysAway === 1 ? '' : 's'}</div>
        </div>
      ))}
    </div>
  );
}

function UdinLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    api.get(`/udin${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .then(r => setLogs(r.data))
      .catch(() => setLogs([]));
  }, [q]);
  function download() {
    window.open(apiAbsoluteUrl(`/api/udin?format=csv${q ? `&q=${encodeURIComponent(q)}` : ''}`), '_blank');
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="input-field flex-1" placeholder="Search UDIN / CA / document type" aria-label="Search UDIN, CA, or document type" value={q} onChange={e => setQ(e.target.value)} />
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={download}><Download size={16} /> CSV</Button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="table-header text-left">
            <th className="px-4 py-3">Date</th><th className="px-4 py-3">CA</th><th className="px-4 py-3">Document Type</th><th className="px-4 py-3">UDIN</th><th className="px-4 py-3">Status</th>
          </tr></thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-2">{new Date(l.generatedAt).toLocaleDateString('en-IN')}</td>
                <td>{l.caName}</td>
                <td>{l.documentType}</td>
                <td className="font-mono text-xs">{l.udin}</td>
                <td>{l.status === 'Active' ? <span className="text-success">Active</span> : <span className="text-danger">Revoked</span>}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5}><EmptyState title="No UDIN entries" className="py-8" /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BillingReport() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [outstanding, setOutstanding] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get('/management-reports/billing')
      .then(r => setInvoices(r.data))
      .catch(() => setError('Failed to load billing data. Please try again.'));
    api.get('/invoices/outstanding/summary')
      .then(r => setOutstanding(r.data))
      .catch(() => {});
  }, []);
  if (error) return <ErrorBanner message={error} />;
  return (
    <div className="space-y-4">
      {outstanding && (
        <div className="card p-4">
          <div className="text-sm text-foreground-muted">Total outstanding</div>
          <div className="text-3xl font-bold text-foreground">₹{Number(outstanding.totalOutstanding).toLocaleString('en-IN')}</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            {outstanding.perClient.slice(0, 6).map((c: any) => (
              <div key={c.clientId} className="p-2 bg-surface-muted rounded">
                <div className="font-medium">{c.clientName}</div>
                <div className="text-foreground-muted">₹{Number(c.outstanding).toLocaleString('en-IN')} · {c.count} invoice(s)</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="table-header text-left">
            <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Issue date</th><th className="px-4 py-3">Due date</th>
            <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3">Status</th>
          </tr></thead>
          <tbody>
            {invoices.map(i => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{i.invoiceNo}</td>
                <td>{i.client.name}</td>
                <td>{new Date(i.issueDate).toLocaleDateString('en-IN')}</td>
                <td>{new Date(i.dueDate).toLocaleDateString('en-IN')}</td>
                <td className="text-right">₹{Number(i.totalAmount).toLocaleString('en-IN')}</td>
                <td className="text-right">₹{Number(i.paidAmount).toLocaleString('en-IN')}</td>
                <td>{i.status}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={7}><EmptyState title="No invoices yet" className="py-8" /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffProductivity() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    api.get(`/management-reports/staff-productivity?month=${month}`)
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load staff productivity. Please try again.'));
  }, [month]);
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label htmlFor="staff-productivity-month" className="text-sm text-foreground-muted">Month</label>
        <input id="staff-productivity-month" type="month" aria-label="Month" className="input-field w-auto" value={month} onChange={e => setMonth(e.target.value)} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="table-header text-left">
            <th className="px-4 py-3">Staff</th><th className="px-4 py-3">Role</th>
            <th className="px-4 py-3 text-right">Billable</th><th className="px-4 py-3 text-right">Non-billable</th>
            <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Target</th>
            <th className="px-4 py-3 text-right">Utilisation</th><th className="px-4 py-3 text-right">Achievement</th>
          </tr></thead>
          <tbody>
            {data.rows.map((r: any) => (
              <tr key={r.userId} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td>{r.role}</td>
                <td className="text-right">{r.billableHours}</td>
                <td className="text-right">{r.nonBillableHours}</td>
                <td className="text-right">{r.totalHours}</td>
                <td className="text-right">{r.targetHours}</td>
                <td className="text-right">{r.utilisationPct}%</td>
                <td className="text-right">{r.achievedPct}%</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr><td colSpan={8}><EmptyState title="No time entries for this month" className="py-8" /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
