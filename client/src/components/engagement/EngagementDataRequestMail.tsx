import { useEffect, useState } from 'react';
import { PaperPlaneTilt as Send } from '@phosphor-icons/react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
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
  const [busy, setBusy] = useState(false);

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

  if (!canSend) return null;

  async function send() {
    if (!templateId) return;
    setBusy(true);
    try {
      await api.post(`/templates/${templateId}/send`, { clientId, engagementId });
      showToast({ title: 'Data request sent', variant: 'success' });
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email data request</DialogTitle>
          </DialogHeader>
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !templateId} onClick={() => void send()}>
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
