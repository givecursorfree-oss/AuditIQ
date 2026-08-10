import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeSlash, Plus, Pencil, Trash, ShieldCheck, ClockCounterClockwise, Copy, SignIn } from '@phosphor-icons/react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { openVaultPortalLogin, resolveAutoLoginPortal } from '@/lib/vaultPortalLogin';
import { ResponsiveTable } from '@/components/layout/ResponsiveTable';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { appToast } from '@/context/AppToastContext';

interface VaultEntry {
  id: string;
  clientId: string;
  portalName: string;
  username: string;
  notes: string | null;
  createdAt: string;
  client: { id: string; name: string };
  createdBy: { firstName: string; lastName: string };
}

interface AuditLog {
  id: string;
  action: string;
  createdAt: string;
  user: { firstName: string; lastName: string };
  entry: { portalName: string; client: { name: string } };
}

const PORTAL_PRESETS = ['Income Tax', 'GST', 'MCA', 'TAN', 'TRACES', 'EPF', 'PT', 'Other'];

export default function PasswordVault() {
  const [searchParams] = useSearchParams();
  const filterClientId = searchParams.get('clientId') ?? '';
  const { user } = useAuth();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    clientId: '', portalName: 'Income Tax', username: '', password: '', notes: '',
  });
  const [error, setError] = useState('');

  const isPartner = user?.role === 'Partner' || user?.role === 'Admin';

  async function load() {
    setLoading(true);
    try {
      const vaultUrl = filterClientId
        ? `/vault?clientId=${encodeURIComponent(filterClientId)}`
        : '/vault';
      const [e, c] = await Promise.all([
        api.get<VaultEntry[]>(vaultUrl),
        api.get('/clients?limit=200'),
      ]);
      setEntries(e.data);
      setClients(c.data.clients || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load vault');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [filterClientId]);

  async function reveal(id: string) {
    if (revealed[id]) {
      setRevealed(prev => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    try {
      const r = await api.get(`/vault/${id}/reveal`);
      setRevealed(prev => ({ ...prev, [id]: r.data.password }));
    } catch (e: any) {
      void appAlert({ title: 'Reveal failed', message: e?.response?.data?.error || 'Failed to reveal password' });
    }
  }

  async function copy(id: string) {
    let pwd = revealed[id];
    if (!pwd) {
      try { const r = await api.get(`/vault/${id}/reveal`); pwd = r.data.password; } catch { return; }
    }
    if (pwd) {
      await navigator.clipboard.writeText(pwd);
      appToast({ message: 'Password copied to clipboard', variant: 'success' });
    }
  }

  function openCreate() {
    setEditing(null);
    const defaultClient =
      filterClientId && clients.some((c) => c.id === filterClientId)
        ? filterClientId
        : clients[0]?.id || '';
    setForm({ clientId: defaultClient, portalName: 'Income Tax', username: '', password: '', notes: '' });
    setShowForm(true);
  }
  function openEdit(e: VaultEntry) {
    setEditing(e);
    setForm({ clientId: e.clientId, portalName: e.portalName, username: e.username, password: '', notes: e.notes || '' });
    setShowForm(true);
  }

  async function submit() {
    try {
      if (editing) {
        const body: any = { portalName: form.portalName, username: form.username, notes: form.notes };
        if (form.password) body.password = form.password;
        await api.patch(`/vault/${editing.id}`, body);
      } else {
        await api.post('/vault', form);
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      void appAlert({ title: 'Save failed', message: e?.response?.data?.error || 'Failed to save credential' });
    }
  }

  async function remove(e: VaultEntry) {
    const ok = await appConfirm({
      title: 'Delete credential?',
      message: `Remove vault entry for ${e.portalName} (${e.client.name})? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/vault/${e.id}`);
      await load();
    } catch (err: any) {
      void appAlert({ title: 'Delete failed', message: err?.response?.data?.error || 'Failed to delete' });
    }
  }

  async function openPortal(e: VaultEntry) {
    try {
      const msg = await openVaultPortalLogin(e);
      appToast({ message: msg, variant: 'success' });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      void appAlert({ title: 'Portal login failed', message: ax.response?.data?.error || 'Portal login failed' });
    }
  }

  async function openAudit() {
    setShowAudit(true);
    try {
      const r = await api.get('/vault/audit-log/all');
      setAuditLogs(r.data);
    } catch (e: any) {
      void appAlert({ title: 'Audit log failed', message: e?.response?.data?.error || 'Failed to load audit log' });
    }
  }

  return (
    <AppPageContainer className="space-y-6">
      <PageHeader
        title="Password Vault"
        description="Encrypted credentials for client portals. AES-256 at rest."
        actions={
          <div className="flex gap-2">
            {isPartner && (
              <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => void openAudit()}>
                <ClockCounterClockwise size={16} /> Audit log
              </button>
            )}
            <button type="button" className="btn-primary flex items-center gap-2" onClick={openCreate}>
              <Plus size={16} /> Add credential
            </button>
          </div>
        }
      />

      {error && <div className="card p-3 bg-danger/10 text-danger border-danger/30">{error}</div>}

      <ResponsiveTable>
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header text-left">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Portal</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Password</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="py-8 text-center text-foreground-muted">Loading…</td></tr>}
            {!loading && entries.map(e => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium text-foreground">{e.client.name}</td>
                <td className="px-4 py-2">{e.portalName}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.username}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {revealed[e.id] ? <span className="text-foreground">{revealed[e.id]}</span> : '••••••••'}
                </td>
                <td className="px-4 py-2 text-xs text-foreground-muted">{e.createdBy.firstName} {e.createdBy.lastName}</td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button type="button" title="Reveal" className="icon-btn" onClick={() => void reveal(e.id)}>
                      {revealed[e.id] ? <EyeSlash size={16} /> : <Eye size={16} />}
                    </button>
                    <button type="button" title="Copy" className="icon-btn" onClick={() => void copy(e.id)}><Copy size={16} /></button>
                    {resolveAutoLoginPortal(e.portalName) && (
                      <button type="button" title="Auto-login to portal" className="icon-btn" onClick={() => void openPortal(e)}>
                        <SignIn size={16} />
                      </button>
                    )}
                    <button type="button" title="Edit" className="icon-btn" onClick={() => openEdit(e)}><Pencil size={16} /></button>
                    {isPartner && (
                      <button type="button" title="Delete" className="icon-btn hover:text-danger" onClick={() => void remove(e)}><Trash size={16} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-foreground-muted">No credentials stored yet.</td></tr>
            )}
          </tbody>
        </table>
      </ResponsiveTable>

      <div className="card p-3 bg-primary/5 border-primary/20 text-xs text-foreground-muted flex items-start gap-2">
        <ShieldCheck size={16} className="text-primary mt-0.5 shrink-0" />
        Every password reveal is recorded in the audit log with user identity, timestamp, and IP. Only Partners can delete entries or view the audit log.
      </div>

      {showForm && (
        <Modal title={editing ? 'Edit credential' : 'Add credential'} onClose={() => setShowForm(false)}>
          <div className="space-y-3">
            <Select label="Client" value={form.clientId} onChange={v => setForm({ ...form, clientId: v })}
              options={clients.map(c => ({ value: c.id, label: c.name }))} disabled={!!editing} />
            <Select label="Portal" value={form.portalName} onChange={v => setForm({ ...form, portalName: v })}
              options={PORTAL_PRESETS.map(p => ({ value: p, label: p }))} />
            <Input label="Username" value={form.username} onChange={v => setForm({ ...form, username: v })} />
            <Input label={editing ? 'New password (leave blank to keep)' : 'Password'} type="password" value={form.password}
              onChange={v => setForm({ ...form, password: v })} />
            <Input label="Notes" value={form.notes} onChange={v => setForm({ ...form, notes: v })} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => void submit()}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      {showAudit && (
        <Modal title="Vault access log" onClose={() => setShowAudit(false)}>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {auditLogs.map(l => (
              <div key={l.id} className="flex justify-between text-sm py-1 border-b border-border">
                <span>
                  <strong>{l.user.firstName} {l.user.lastName}</strong>{' '}
                  <span className="text-foreground-muted">{l.action}</span>{' '}
                  <span className="text-foreground">{l.entry.portalName} ({l.entry.client.name})</span>
                </span>
                <span className="text-foreground-muted text-xs">{new Date(l.createdAt).toLocaleString('en-IN')}</span>
              </div>
            ))}
            {auditLogs.length === 0 && <div className="text-center text-foreground-muted py-6">No access yet</div>}
          </div>
        </Modal>
      )}
    </AppPageContainer>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <button type="button" onClick={onClose} className="text-foreground-muted hover:text-foreground">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground-muted">{label}</span>
      <input className="input-field mt-1 w-full" type={type} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground-muted">{label}</span>
      <select className="input-field mt-1 w-full" value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
