import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MagnifyingGlass as Search,
  ClipboardText,
  CaretRight,
  Plus,
  PencilSimple,
  Archive,
  ArrowCounterClockwise,
  EnvelopeSimple,
} from '@phosphor-icons/react';
import api from '@/services/api';
import PageHeader from '@/components/layout/PageHeader';
import PageLoading from '@/components/layout/PageLoading';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { ServiceRequirementsPanel } from '@/components/engagement/ServiceRequirementsPanel';
import { WORKFLOW_DOMAIN_LABELS, type WorkflowDomain } from '@/lib/workflowCatalog';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { appConfirm } from '@/context/AppDialogContext';
import { useAppToast } from '@/context/AppToastContext';
import { formatApiError } from '@/lib/apiErrors';

type CatalogService = {
  id?: string;
  code: string;
  domain: WorkflowDomain;
  name: string;
  dueRule?: string;
  recurrence?: string;
  templateId?: string;
  summary?: string;
  authority?: string;
  applicability?: string;
  firmWillAsk?: string[];
  requirementCount?: number;
  clientDocumentCount?: number;
  isSystem?: boolean;
  archivedAt?: string | null;
  sortOrder?: number;
};

type ServiceForm = {
  code: string;
  name: string;
  domain: WorkflowDomain;
  dueRule: string;
  recurrence: string;
  templateId: string;
};

type TemplateForm = {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
};

const DOMAIN_TABS: (WorkflowDomain | 'ALL')[] = ['ALL', 'DT', 'IDT', 'AUDIT'];
const TEMPLATE_OPTIONS = [
  { id: 'DT_COMPLIANCE', label: 'Direct tax compliance' },
  { id: 'IDT_GST_RETURN', label: 'GST return cycle' },
  { id: 'AUDIT_STATUTORY', label: 'Statutory audit' },
];
const RECURRENCE_OPTIONS = ['', 'monthly', 'quarterly', 'annual', 'ad_hoc'];

const EMPTY_FORM: ServiceForm = {
  code: '',
  name: '',
  domain: 'DT',
  dueRule: '',
  recurrence: '',
  templateId: 'DT_COMPLIANCE',
};

export default function ServiceCatalog() {
  const { user } = useAuth();
  const { showToast } = useAppToast();
  const canManage = ['Partner', 'Admin', 'Manager'].includes(user?.role || '');
  const canArchive = ['Partner', 'Admin', 'Manager', 'HR'].includes(user?.role || '');

  const [services, setServices] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState<WorkflowDomain | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const [tplOpen, setTplOpen] = useState(false);
  const [tplForm, setTplForm] = useState<TemplateForm | null>(null);
  const [tplBusy, setTplBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = showArchived ? '?includeArchived=true' : '';
      const { data } = await api.get<{ services: CatalogService[] }>(`/workflow/catalog${q}`);
      setServices(data.services ?? []);
      setLoadError('');
    } catch (err: unknown) {
      console.error(err);
      const ax = err as { response?: { data?: { error?: string } } };
      setLoadError(ax.response?.data?.error || 'Could not load service catalog. Try refreshing the page.');
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (!showArchived && s.archivedAt) return false;
      if (showArchived && !s.archivedAt) return false;
      if (domain !== 'ALL' && s.domain !== domain) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.summary ?? '').toLowerCase().includes(q) ||
        (s.authority ?? '').toLowerCase().includes(q)
      );
    });
  }, [services, domain, search, showArchived]);

  useEffect(() => {
    if (filtered.length > 0 && !selectedCode) setSelectedCode(filtered[0].code);
    if (selectedCode && !filtered.find((s) => s.code === selectedCode) && filtered[0]) {
      setSelectedCode(filtered[0].code);
    }
  }, [filtered, selectedCode]);

  const selected = filtered.find((s) => s.code === selectedCode) ?? null;

  function openCreate() {
    setEditingCode(null);
    setForm({
      ...EMPTY_FORM,
      domain: domain === 'ALL' ? 'DT' : domain,
      templateId: domain === 'IDT' ? 'IDT_GST_RETURN' : domain === 'AUDIT' ? 'AUDIT_STATUTORY' : 'DT_COMPLIANCE',
    });
    setEditorOpen(true);
  }

  function openEdit(s: CatalogService) {
    setEditingCode(s.code);
    setForm({
      code: s.code,
      name: s.name,
      domain: s.domain,
      dueRule: s.dueRule ?? '',
      recurrence: s.recurrence ?? '',
      templateId: s.templateId || 'DT_COMPLIANCE',
    });
    setEditorOpen(true);
  }

  async function saveService() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      if (editingCode) {
        await api.put(`/workflow/services/${editingCode}`, {
          name: form.name.trim(),
          domain: form.domain,
          dueRule: form.dueRule.trim() || null,
          recurrence: form.recurrence || null,
          templateId: form.templateId,
        });
        showToast({ message: 'Service updated', variant: 'success' });
      } else {
        await api.post('/workflow/services', {
          code: form.code.trim() || form.name,
          name: form.name.trim(),
          domain: form.domain,
          dueRule: form.dueRule.trim() || null,
          recurrence: form.recurrence || null,
          templateId: form.templateId,
        });
        showToast({ message: 'Service added', variant: 'success' });
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      showToast({ title: 'Save failed', message: formatApiError(err), variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function archiveSelected() {
    if (!selected) return;
    const ok = await appConfirm({
      title: 'Archive service?',
      message: `${selected.name} will be hidden from new engagements and can be restored later.`,
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    try {
      await api.post(`/workflow/services/${selected.code}/archive`);
      showToast({ message: 'Service archived', variant: 'success' });
      setSelectedCode(null);
      await load();
    } catch (err) {
      showToast({ title: 'Archive failed', message: formatApiError(err), variant: 'error' });
    }
  }

  async function restoreSelected() {
    if (!selected) return;
    const code = selected.code;
    try {
      await api.post(`/workflow/services/${code}/restore`);
      showToast({ message: 'Service restored', variant: 'success' });
      setSelectedCode(code);
      // Flip to active list; load() re-runs via showArchived effect
      setShowArchived(false);
    } catch (err) {
      showToast({ title: 'Restore failed', message: formatApiError(err), variant: 'error' });
    }
  }

  async function openDataRequestTemplate() {
    if (!selected) return;
    setTplBusy(true);
    try {
      const { data } = await api.get<TemplateForm>(
        `/workflow/services/${selected.code}/data-request-template`
      );
      setTplForm({
        id: data.id,
        name: data.name,
        category: data.category,
        subject: data.subject,
        body: data.body,
      });
      setTplOpen(true);
    } catch (err) {
      showToast({ title: 'Template load failed', message: formatApiError(err), variant: 'error' });
    } finally {
      setTplBusy(false);
    }
  }

  async function saveTemplate() {
    if (!tplForm) return;
    if (!tplForm.subject.trim() || !tplForm.body.trim()) return;
    setTplBusy(true);
    try {
      await api.put(`/templates/${tplForm.id}`, {
        name: tplForm.name,
        category: tplForm.category,
        subject: tplForm.subject.trim(),
        body: tplForm.body.trim(),
      });
      showToast({ message: 'Data request template saved', variant: 'success' });
      setTplOpen(false);
    } catch (err) {
      showToast({ title: 'Save failed', message: formatApiError(err), variant: 'error' });
    } finally {
      setTplBusy(false);
    }
  }

  return (
    <AppPageContainer>
      <PageHeader
        title="Service Catalog"
        description="MKD practice services — what the firm needs from clients, where it lives in AuditIQ, and checklist items auto-created per engagement."
        actions={
          canManage ? (
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus size={14} className="mr-1" aria-hidden />
              Add service
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col lg:flex-row gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search services"
            className="input-field pl-9 w-full"
          />
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1 flex-wrap">
          {DOMAIN_TABS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDomain(d)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                domain === d ? 'bg-card text-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              {d === 'ALL' ? 'All practice areas' : WORKFLOW_DOMAIN_LABELS[d]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setShowArchived((v) => !v);
            setSelectedCode(null);
          }}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
            showArchived
              ? 'border-primary/40 bg-primary/5 text-foreground'
              : 'border-border text-foreground-muted hover:text-foreground'
          }`}
        >
          {showArchived ? 'Active services' : 'Archived'}
        </button>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {loadError}
        </div>
      )}

      {loading ? (
        <PageLoading className="h-48" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {filtered.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => setSelectedCode(s.code)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selectedCode === s.code
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-card hover:border-primary/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <p className="text-[10px] text-foreground-muted mt-0.5">
                      {WORKFLOW_DOMAIN_LABELS[s.domain]}
                      {s.dueRule ? ` · ${s.dueRule}` : ''}
                      {s.archivedAt ? ' · Archived' : ''}
                    </p>
                  </div>
                  <CaretRight size={14} className="shrink-0 text-foreground-muted mt-1" />
                </div>
                {s.summary && (
                  <p className="text-xs text-foreground-muted mt-2 line-clamp-2 leading-relaxed">{s.summary}</p>
                )}
                <div className="flex gap-2 mt-2 text-[10px] text-foreground-muted">
                  {s.clientDocumentCount != null && <span>{s.clientDocumentCount} client docs</span>}
                  {s.requirementCount != null && <span>{s.requirementCount} requirements</span>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-foreground-muted text-center py-8">
                {showArchived ? 'No archived services.' : 'No services match your search.'}
              </p>
            )}
          </div>

          <div className="min-w-0">
            {selected ? (
              <div className="space-y-4">
                <div className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ClipboardText size={20} className="text-primary shrink-0" />
                      <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canManage && !selected.archivedAt && (
                        <>
                          <Button type="button" size="sm" variant="outline" onClick={() => openEdit(selected)}>
                            <PencilSimple size={14} className="mr-1" aria-hidden />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={tplBusy}
                            onClick={() => void openDataRequestTemplate()}
                          >
                            <EnvelopeSimple size={14} className="mr-1" aria-hidden />
                            Data request template
                          </Button>
                        </>
                      )}
                      {canArchive && !selected.archivedAt && (
                        <Button type="button" size="sm" variant="outline" onClick={() => void archiveSelected()}>
                          <Archive size={14} className="mr-1" aria-hidden />
                          Archive
                        </Button>
                      )}
                      {canArchive && selected.archivedAt && (
                        <Button type="button" size="sm" onClick={() => void restoreSelected()}>
                          <ArrowCounterClockwise size={14} className="mr-1" aria-hidden />
                          Restore
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-foreground-muted mb-2">
                    {selected.code}
                    {selected.dueRule ? ` · ${selected.dueRule}` : ''}
                    {selected.recurrence ? ` · ${selected.recurrence}` : ''}
                  </p>
                  {selected.summary && (
                    <p className="text-sm text-foreground-secondary leading-relaxed">{selected.summary}</p>
                  )}
                </div>
                {!selected.archivedAt && <ServiceRequirementsPanel serviceCode={selected.code} />}
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">Select a service to view requirements.</p>
            )}
          </div>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCode ? 'Edit service' : 'Add service'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {!editingCode && (
              <div>
                <Label htmlFor="svc-code">Code</Label>
                <Input
                  id="svc-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="GSTR_9"
                />
              </div>
            )}
            <div>
              <Label htmlFor="svc-name">Name</Label>
              <Input
                id="svc-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="svc-domain">Practice area</Label>
              <select
                id="svc-domain"
                className="input-field w-full"
                value={form.domain}
                onChange={(e) => {
                  const d = e.target.value as WorkflowDomain;
                  setForm({
                    ...form,
                    domain: d,
                    templateId:
                      d === 'IDT' ? 'IDT_GST_RETURN' : d === 'AUDIT' ? 'AUDIT_STATUTORY' : 'DT_COMPLIANCE',
                  });
                }}
              >
                {(Object.keys(WORKFLOW_DOMAIN_LABELS) as WorkflowDomain[]).map((d) => (
                  <option key={d} value={d}>
                    {WORKFLOW_DOMAIN_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="svc-due">Due rule</Label>
              <Input
                id="svc-due"
                value={form.dueRule}
                onChange={(e) => setForm({ ...form, dueRule: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="svc-recurrence">Recurrence</Label>
              <select
                id="svc-recurrence"
                className="input-field w-full"
                value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
              >
                {RECURRENCE_OPTIONS.map((r) => (
                  <option key={r || 'none'} value={r}>
                    {r || '—'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="svc-template">Workflow template</Label>
              <select
                id="svc-template"
                className="input-field w-full"
                value={form.templateId}
                onChange={(e) => setForm({ ...form, templateId: e.target.value })}
              >
                {TEMPLATE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !form.name.trim()} onClick={() => void saveService()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Data request template</DialogTitle>
          </DialogHeader>
          {tplForm && (
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="tpl-name">Name</Label>
                <Input
                  id="tpl-name"
                  value={tplForm.name}
                  onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="tpl-subject">Subject</Label>
                <Input
                  id="tpl-subject"
                  value={tplForm.subject}
                  onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="tpl-body">Body</Label>
                <textarea
                  id="tpl-body"
                  className="input-field w-full min-h-[220px] font-mono text-sm"
                  value={tplForm.body}
                  onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTplOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={tplBusy || !tplForm?.subject.trim() || !tplForm?.body.trim()}
              onClick={() => void saveTemplate()}
            >
              {tplBusy ? 'Saving…' : 'Save template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPageContainer>
  );
}
