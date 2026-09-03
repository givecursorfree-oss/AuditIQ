import { useEffect, useState } from 'react';

import { PaperPlaneTilt as Send, Plus, PencilSimple as Edit, Trash, ClockCounterClockwise as History } from '@phosphor-icons/react';

import api from '../services/api';

import { useAuth } from '../context/AuthContext';

import { AppPageContainer } from '../components/layout/AppPageContainer';

import { PanelCard } from '../components/layout/PanelCard';

import PageHeader from '../components/layout/PageHeader';

import { Button } from '@/components/ui/button';

import {

  Dialog,

  DialogContent,

  DialogDescription,

  DialogFooter,

  DialogHeader,

  DialogTitle,

} from '@/components/ui/dialog';

import { appConfirm } from '@/context/AppDialogContext';

import { useAppToast } from '@/context/AppToastContext';

import { TemplateLibrarySkeleton } from '@/components/mkd/MkdSkeletons';



interface DocumentTemplate {

  id: string;

  name: string;

  category: string;

  subject: string;

  body: string;

  variables?: string[];

  attachPdf?: boolean;

  isActive: boolean;

}



interface TemplateSendRow {

  id: string;

  filledSubject?: string | null;

  sentAt: string;
  scheduledAt?: string | null;

  deliveryStatus: string;

  template: { id: string; name: string; category: string };

  client: { id: string; name: string };

  sentBy: { firstName: string; lastName: string };

}



interface ClientOption {

  id: string;

  name: string;

}



const CATEGORIES = [

  'engagement_letter',

  'data_request',

  'reminder',

  'notice_communication',

  'gstr_monthly_letter',

  'advance_tax_request',

  'tp_study_request',

  'billing_invoice',

  'general',

];



const EMPTY_FORM = {

  name: '',

  category: 'general',

  subject: '',

  body: '',

  attachPdf: false,

};



export default function DocumentLibraryTemplates() {

  const { user } = useAuth();

  const canEdit = user?.role === 'Partner' || user?.role === 'Admin' || user?.role === 'Manager';

  const canDelete = user?.role === 'Partner' || user?.role === 'Admin';



  const [tab, setTab] = useState<'library' | 'history'>('library');

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);

  const [sendHistory, setSendHistory] = useState<TemplateSendRow[]>([]);

  const [clients, setClients] = useState<ClientOption[]>([]);

  const [category, setCategory] = useState('');

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState('');

  const [sendTpl, setSendTpl] = useState<DocumentTemplate | null>(null);

  const [sendClientId, setSendClientId] = useState('');
  const [sendAt, setSendAt] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);

  const [busy, setBusy] = useState(false);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { showToast } = useAppToast();



  async function loadLibrary() {

    const q = category ? `?category=${encodeURIComponent(category)}` : '';

    const tplRes = await api.get<DocumentTemplate[]>(`/templates${q}`);

    setTemplates(tplRes.data);

  }



  async function loadHistory() {

    const res = await api.get<TemplateSendRow[]>('/templates/sends/history');

    setSendHistory(res.data);

  }



  async function load() {

    setLoading(true);

    setLoadError('');

    try {

      const clientRes = await api.get<{ clients?: ClientOption[]; data?: ClientOption[] }>('/clients?limit=200');

      const cl = clientRes.data;

      setClients(Array.isArray(cl) ? cl : cl.clients ?? cl.data ?? []);

      await Promise.all([loadLibrary(), loadHistory()]);

    } catch {

      setLoadError('Failed to load templates. Please try again.');

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => {

    void load();

  }, [category]);



  function openCreate() {

    setEditingId(null);

    setForm(EMPTY_FORM);

    setFormErrors({});

    setEditorOpen(true);

  }



  function openEdit(t: DocumentTemplate) {

    setEditingId(t.id);

    setForm({

      name: t.name,

      category: t.category,

      subject: t.subject,

      body: t.body,

      attachPdf: t.attachPdf ?? false,

    });

    setFormErrors({});

    setEditorOpen(true);

  }



  async function saveTemplate() {

    const errors: Record<string, string> = {};

    if (!form.name.trim()) errors.name = 'Name is required';

    if (!form.subject.trim()) errors.subject = 'Subject is required';

    if (!form.body.trim()) errors.body = 'Body is required';

    setFormErrors(errors);

    if (Object.keys(errors).length) return;

    setBusy(true);

    try {

      if (editingId) {

        await api.put(`/templates/${editingId}`, form);

        showToast({ title: 'Template updated', message: form.name, variant: 'success' });

      } else {

        await api.post('/templates', form);

        showToast({ title: 'Template created', message: form.name, variant: 'success' });

      }

      setEditorOpen(false);

      await loadLibrary();

    } catch (err: unknown) {

      const ax = err as { response?: { data?: { error?: string } } };

      showToast({ title: 'Save failed', message: ax.response?.data?.error || 'Could not save template.', variant: 'error' });

    } finally {

      setBusy(false);

    }

  }



  async function deleteTemplate(t: DocumentTemplate) {

    const ok = await appConfirm({

      title: 'Deactivate template',

      message: `Deactivate "${t.name}"? It will be hidden from the library.`,

      destructive: true,

      confirmLabel: 'Deactivate',

    });

    if (!ok) return;

    setBusy(true);

    try {

      await api.delete(`/templates/${t.id}`);

      showToast({ title: 'Template deactivated', message: t.name, variant: 'success' });

      await loadLibrary();

    } catch {

      showToast({ title: 'Delete failed', message: 'Could not deactivate template.', variant: 'error' });

    } finally {

      setBusy(false);

    }

  }



  async function sendTemplate() {

    if (!sendTpl || !sendClientId) return;

    setBusy(true);

    try {

      const client = clients.find((c) => c.id === sendClientId);

      await api.post(`/templates/${sendTpl.id}/send`, {
        clientId: sendClientId,
        scheduledAt: sendAt ? new Date(sendAt).toISOString() : undefined,
      });

      showToast({

        title: sendAt ? 'Template scheduled' : 'Template sent',

        message: sendAt
          ? `"${sendTpl.name}" is scheduled for ${new Date(sendAt).toLocaleString('en-IN')}.`
          : `"${sendTpl.name}" emailed to ${client?.name ?? 'client'}.`,

        variant: 'success',

      });

      setSendTpl(null);
      setSendAt('');

      setTab('history');

      await loadHistory();

    } catch (err: unknown) {

      const ax = err as { response?: { data?: { error?: string } } };

      showToast({ title: 'Send failed', message: ax.response?.data?.error || 'Could not send template.', variant: 'error' });

    } finally {

      setBusy(false);

    }

  }



  return (

    <AppPageContainer>

      <PageHeader

        title="Document Templates"

        description="MKD letter library — create, edit, and email clients with {{variables}}"

        actions={

          canEdit ? (

            <Button type="button" size="sm" onClick={openCreate}>

              <Plus size={16} className="mr-1" /> New template

            </Button>

          ) : undefined

        }

      />



      <div className="flex flex-wrap gap-2 mb-4">

        <Button

          type="button"

          size="sm"

          variant={tab === 'library' ? 'default' : 'outline'}

          onClick={() => setTab('library')}

        >

          Template library

        </Button>

        <Button

          type="button"

          size="sm"

          variant={tab === 'history' ? 'default' : 'outline'}

          onClick={() => setTab('history')}

        >

          <History size={16} className="mr-1" /> Send history

        </Button>

      </div>



      {loadError && (

        <div className="card p-3 text-sm text-destructive mb-4 flex justify-between gap-2">

          <span>{loadError}</span>

          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>

            Retry

          </Button>

        </div>

      )}



      {sendTpl && (

        <div className="card p-4 mb-4 space-y-3 border border-primary/30">

          <h3 className="font-medium">Send: {sendTpl.name}</h3>

          <select className="input-field w-full max-w-md" value={sendClientId} onChange={(e) => setSendClientId(e.target.value)}>

            <option value="">Select client…</option>

            {clients.map((c) => (

              <option key={c.id} value={c.id}>

                {c.name}

              </option>

            ))}

          </select>

          <label className="block text-sm max-w-md">
            <span className="block text-foreground-muted mb-1">Send now or schedule for later</span>
            <input
              className="input-field w-full"
              type="datetime-local"
              value={sendAt}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              onChange={(e) => setSendAt(e.target.value)}
            />
            <span className="block text-xs text-foreground-muted mt-1">
              Leave blank to send immediately. Times use the server timezone.
            </span>
          </label>

          <div className="flex gap-2">

            <Button type="button" size="sm" disabled={busy || !sendClientId} onClick={() => void sendTemplate()}>

              {busy ? 'Processing…' : sendAt ? 'Schedule email' : 'Send email'}

            </Button>

            <Button type="button" size="sm" variant="outline" onClick={() => setSendTpl(null)}>

              Cancel

            </Button>

          </div>

        </div>

      )}



      {tab === 'library' && (

        <>

          <div className="flex flex-wrap gap-2 mb-4 items-center">

            <select className="input-field text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>

              <option value="">All categories</option>

              {CATEGORIES.map((c) => (

                <option key={c} value={c}>

                  {c.replace(/_/g, ' ')}

                </option>

              ))}

            </select>

            <span className="text-sm text-foreground-muted">{templates.length} template(s)</span>

          </div>



          <PanelCard title="Templates">

            {loading ? (

              <TemplateLibrarySkeleton />

            ) : templates.length === 0 ? (

              <div className="py-10 text-center text-foreground-muted">

                No templates yet. Run db reset to seed MKD defaults, or create one above.

              </div>

            ) : (

              <div className="grid gap-3 md:grid-cols-2">

                {templates.map((t) => (

                  <div key={t.id} className="card p-4 flex flex-col gap-2">

                    <div className="font-medium">{t.name}</div>

                    <div className="text-xs text-foreground-muted capitalize">{t.category.replace(/_/g, ' ')}</div>

                    <div className="text-sm text-foreground-muted line-clamp-2">{t.subject}</div>

                    {t.variables && t.variables.length > 0 && (

                      <div className="flex flex-wrap gap-1">

                        {t.variables.slice(0, 8).map((v) => (

                          <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground-muted">

                            {`{{${v}}}`}

                          </span>

                        ))}

                      </div>

                    )}

                    <div className="flex flex-wrap gap-2 mt-auto pt-2">

                      <Button

                        type="button"

                        size="sm"

                        variant="secondary"

                        onClick={() => {

                          setSendTpl(t);

                          setSendClientId('');

                        }}

                      >

                        <Send size={14} className="mr-1" /> Send

                      </Button>

                      {canEdit && (

                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(t)}>

                          <Edit size={14} className="mr-1" /> Edit

                        </Button>

                      )}

                      {canDelete && (

                        <Button type="button" size="sm" variant="ghost" onClick={() => void deleteTemplate(t)}>

                          <Trash size={14} className="mr-1" /> Deactivate

                        </Button>

                      )}

                    </div>

                  </div>

                ))}

              </div>

            )}

          </PanelCard>

        </>

      )}



      {tab === 'history' && (

        <PanelCard title="Recent sends">

          {loading ? (

            <TemplateLibrarySkeleton />

          ) : sendHistory.length === 0 ? (

            <div className="py-10 text-center text-foreground-muted">No sends recorded yet.</div>

          ) : (

            <div className="divide-y divide-border text-sm">

              {sendHistory.map((s) => (

                <div key={s.id} className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">

                  <div>

                    <p className="font-medium">{s.template.name}</p>

                    <p className="text-foreground-muted text-xs">

                      To {s.client.name} · {s.scheduledAt ? `scheduled ${new Date(s.scheduledAt).toLocaleString('en-IN')}` : new Date(s.sentAt).toLocaleString('en-IN')} · {s.deliveryStatus}

                    </p>

                    {s.filledSubject && <p className="text-xs mt-1 line-clamp-1">{s.filledSubject}</p>}

                  </div>

                  <p className="text-xs text-foreground-muted shrink-0">

                    {s.sentBy.firstName} {s.sentBy.lastName}

                  </p>

                </div>

              ))}

            </div>

          )}

        </PanelCard>

      )}



      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>

        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">

          <DialogHeader>

            <DialogTitle>{editingId ? 'Edit template' : 'New template'}</DialogTitle>

            <DialogDescription>

              Use {'{{CLIENT_NAME}}'}, {'{{FIRM_NAME}}'}, and other variables in subject and body.

            </DialogDescription>

          </DialogHeader>

          <div className="space-y-3">

            <label className="block text-sm">

              <span className="text-foreground-muted">Name</span>

              <input className="input-field mt-1 w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

              {formErrors.name && <p className="text-xs text-destructive mt-1">{formErrors.name}</p>}

            </label>

            <label className="block text-sm">

              <span className="text-foreground-muted">Category</span>

              <select className="input-field mt-1 w-full" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>

                {CATEGORIES.map((c) => (

                  <option key={c} value={c}>

                    {c.replace(/_/g, ' ')}

                  </option>

                ))}

              </select>

            </label>

            <label className="block text-sm">

              <span className="text-foreground-muted">Email subject</span>

              <input className="input-field mt-1 w-full" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />

              {formErrors.subject && <p className="text-xs text-destructive mt-1">{formErrors.subject}</p>}

            </label>

            <label className="block text-sm">

              <span className="text-foreground-muted">Body</span>

              <textarea

                className="input-field mt-1 w-full font-mono text-xs min-h-[200px]"

                value={form.body}

                onChange={(e) => setForm({ ...form, body: e.target.value })}

              />

              {formErrors.body && <p className="text-xs text-destructive mt-1">{formErrors.body}</p>}

            </label>

            <label className="flex items-center gap-2 text-sm">

              <input

                type="checkbox"

                checked={form.attachPdf}

                onChange={(e) => setForm({ ...form, attachPdf: e.target.checked })}

              />

              Attach PDF when sending (if configured)

            </label>

          </div>

          <DialogFooter>

            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>

              Cancel

            </Button>

            <Button type="button" disabled={busy} onClick={() => void saveTemplate()}>

              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}

            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>

    </AppPageContainer>

  );

}


