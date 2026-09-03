import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '@/services/api';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CLAIM_TYPE_LABELS, formatInr } from '@/lib/expenseClaims';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { appToast } from '@/context/AppToastContext';
import { getApiErrorMessage } from '@/lib/formPayload';
import { ErrorBanner } from '@/components/layout/ErrorBanner';

type StaffOption = { id: string; firstName: string; lastName: string };
type EngOption = { id: string; title: string; client: { id: string; name: string } };

type ParticipantForm = {
  userId: string;
  engagementId: string;
  clientId: string;
  workType: string;
};

export function NewStaffClaimForm() {
  const { claimType } = useParams<{ claimType: 'food' | 'travel' }>();
  const navigate = useNavigate();
  const type = claimType === 'travel' ? 'travel' : 'food';
  const [engagements, setEngagements] = useState<EngOption[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [form, setForm] = useState({
    expensePayerId: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: '',
    description: '',
  });
  const [participants, setParticipants] = useState<ParticipantForm[]>([
    { userId: '', engagementId: '', clientId: '', workType: type === 'travel' ? 'Travel' : 'Audit' },
  ]);
  const [files, setFiles] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    setMetaError(null);
    void Promise.all([
      api.get<{ engagements: EngOption[] }>('/engagements?limit=100').then((r) => setEngagements(r.data.engagements ?? [])),
      api.get<{ workTypes: string[] }>('/expense-claims/meta/work-types').then((r) => setWorkTypes(r.data.workTypes)),
      api.get<{ staff: StaffOption[] }>('/expense-claims/meta/staff').then((r) => setStaffList(r.data.staff)),
    ]).catch((e) => setMetaError(getApiErrorMessage(e, 'Could not load claim form data')));
  }, []);

  function updateParticipant(idx: number, patch: Partial<ParticipantForm>) {
    setParticipants((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function addParticipant() {
    setParticipants((prev) => [
      ...prev,
      { userId: '', engagementId: '', clientId: '', workType: type === 'travel' ? 'Travel' : 'Audit' },
    ]);
  }

  function removeParticipant(idx: number) {
    if (participants.length <= 1) return;
    setParticipants((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files?.length) {
      await appAlert({ title: 'Receipt required', message: 'Upload at least one image or PDF.' });
      return;
    }
    const filled = participants.filter((p) => p.userId);
    if (filled.length === 0) {
      await appAlert({ title: 'People required', message: 'Select at least one person covered.' });
      return;
    }
    const amount = parseFloat(form.amount);
    const ok = await appConfirm({
      title: 'Submit claim',
      message: `Send ${CLAIM_TYPE_LABELS[type]} claim for ${formatInr(amount)} (${filled.length} ${filled.length === 1 ? 'person' : 'people'})?`,
      confirmLabel: 'Submit',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const first = filled[0]!;
      const { data: claim } = await api.post<{ id: string }>('/expense-claims', {
        claimType: type,
        amount: parseFloat(form.amount),
        expensePayerId: form.expensePayerId || undefined,
        engagementId: first.engagementId || undefined,
        clientId: first.clientId || undefined,
        workType: first.workType,
        expenseDate: form.expenseDate,
        description: type === 'travel' ? form.description : undefined,
        participants: filled.map((p) => ({
          userId: p.userId,
          engagementId: p.engagementId || undefined,
          clientId: p.clientId || undefined,
          workType: p.workType,
        })),
      });
      try {
        const fd = new FormData();
        Array.from(files).forEach((f) => fd.append('files', f));
        await api.post(`/expense-claims/${claim.id}/receipts`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } catch (uploadErr) {
        await api.delete(`/expense-claims/${claim.id}`).catch(() => {});
        throw uploadErr;
      }
      appToast({ message: 'Claim submitted for approval', variant: 'success' });
      navigate('/claims');
    } catch (err) {
      await appAlert({ title: 'Error', message: getApiErrorMessage(err, 'Submit failed') });
    } finally {
      setSubmitting(false);
    }
  }

  const count = participants.filter((p) => p.userId).length || 1;
  const share = form.amount ? (Math.round((parseFloat(form.amount) / count) * 100) / 100) : 0;

  return (
    <AppPageContainer>
      <PageHeader title={`New ${CLAIM_TYPE_LABELS[type]} claim`} />
      {metaError && <ErrorBanner message={metaError} className="mb-4" />}
      <PanelCard>
        <form onSubmit={(e) => void submit(e)} className="space-y-4 max-w-xl">
          <div>
            <Label>Amount (INR)</Label>
            <Input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            {count > 1 && form.amount && (
              <p className="text-xs mt-1">{formatInr(form.amount)} · {count} people · {formatInr(share)}/person</p>
            )}
          </div>
          <div>
            <Label>Paid by</Label>
            <Select value={form.expensePayerId} onValueChange={(v) => setForm({ ...form, expensePayerId: v })}>
              <SelectTrigger><SelectValue placeholder="Self" /></SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} required />
          </div>
          {type === 'travel' && (
            <div>
              <Label>Notes</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          )}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>People covered</Label>
              <Button type="button" size="sm" variant="outline" onClick={addParticipant}>Add</Button>
            </div>
            {participants.map((p, idx) => (
              <div key={idx} className="grid gap-2 border rounded-lg p-3 sm:grid-cols-2">
                <div>
                  <Label>Person</Label>
                  <Select value={p.userId} onValueChange={(v) => updateParticipant(idx, { userId: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {staffList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Engagement</Label>
                  <Select
                    value={p.engagementId}
                    onValueChange={(v) => {
                      const eng = engagements.find((e) => e.id === v);
                      updateParticipant(idx, { engagementId: v, clientId: eng?.client.id ?? '' });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {engagements.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {type === 'food' && (
                  <div>
                    <Label>Type of work</Label>
                    <Select value={p.workType} onValueChange={(v) => updateParticipant(idx, { workType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {workTypes.filter((w) => w !== 'Travel').map((w) => (
                          <SelectItem key={w} value={w}>{w}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {participants.length > 1 && (
                  <div className="flex items-end">
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeParticipant(idx)}>Remove</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div>
            <Label>Receipt / proof</Label>
            <Input type="file" accept="image/*,.pdf" capture="environment" multiple onChange={(e) => setFiles(e.target.files)} required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</Button>
            <Button type="button" variant="outline" asChild><Link to="/claims">Cancel</Link></Button>
          </div>
        </form>
      </PanelCard>
    </AppPageContainer>
  );
}
