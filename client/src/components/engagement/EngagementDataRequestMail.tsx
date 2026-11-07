import { useEffect, useState } from 'react';
import { PaperPlaneTilt as Send } from '@phosphor-icons/react';
import api from '@/services/api';
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
import { useAppToast } from '@/context/AppToastContext';
import { isDataRequestCategory } from '@/lib/dataRequestCategories';

type TemplateRow = {
  id: string;
  name: string;
  category: string;
};

type Props = {
  engagementId: string;
  clientId: string;
  canSend: boolean;
};

export default function EngagementDataRequestMail({ engagementId, clientId, canSend }: Props) {
  const { showToast } = useAppToast();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [toAddress, setToAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await api.get<TemplateRow[]>('/templates');
        const rows = (res.data || []).filter((t) => isDataRequestCategory(t.category));
        setTemplates(rows);
        setTemplateId(rows[0]?.id ?? '');
      } catch {
        setTemplates([]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open || !templateId || !clientId) return;
    setLoadingPreview(true);
    void (async () => {
      try {
        const { data } = await api.post<{
          subject: string;
          body: string;
          to: string | null;
        }>(`/templates/${templateId}/preview`, { clientId, engagementId });
        setSubject(data.subject || '');
        setBody(data.body || '');
        setToAddress(data.to);
      } catch {
        setSubject('');
        setBody('');
        setToAddress(null);
        showToast({
          title: 'Preview failed',
          message: 'Could not load draft. Check client email and try again.',
          variant: 'error',
        });
      } finally {
        setLoadingPreview(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preview when dialog/template/client changes
  }, [open, templateId, clientId, engagementId]);

  if (!canSend) return null;

  async function send() {
    if (!templateId || !subject.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/templates/${templateId}/send`, {
        clientId,
        engagementId,
        subject: subject.trim(),
        body: body.trim(),
      });
      showToast({ message: 'Data request sent', variant: 'success' });
      setOpen(false);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      showToast({
        title: 'Send failed',
        message: ax.response?.data?.error || 'Could not send.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => setOpen(true)}>
        <Send size={14} aria-hidden /> Email data request
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email data request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Template</span>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {toAddress ? (
              <p className="text-xs text-muted-foreground">To: {toAddress}</p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="dr-subject">Subject</Label>
              <Input
                id="dr-subject"
                value={subject}
                disabled={loadingPreview}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-body">Message</Label>
              <textarea
                id="dr-body"
                className="min-h-[180px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={body}
                disabled={loadingPreview}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || loadingPreview || !templateId || !subject.trim() || !body.trim()}
              onClick={() => void send()}
            >
              {busy ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
