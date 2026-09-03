import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/services/api';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { appAlert } from '@/context/AppDialogContext';
import { formatApiError } from '@/lib/apiErrors';

export function LateHoursClaimForm() {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    actualEndTime: '20:00',
    reason: '',
    engagementId: '',
  });
  const [engagements, setEngagements] = useState<{ id: string; title: string }[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    void api
      .get<{ engagements: { id: string; title: string }[] }>('/engagements?limit=50')
      .then((r) => setEngagements(r.data.engagements ?? []));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/claims/late-hours', {
        ...form,
        engagementId: form.engagementId || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      void appAlert({ title: 'Submit failed', message: formatApiError(err) });
    }
  }

  if (submitted) {
    return (
      <AppPageContainer>
        <PageHeader title="Late hours claim" />
        <p className="text-sm">Claim submitted for manager approval.</p>
        <Link to="/claims" className="text-primary text-sm underline">
          Back to claims
        </Link>
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer>
      <PageHeader title="Late hours claim" description="Submit overtime for manager approval" />
      <PanelCard>
        <form onSubmit={(e) => void submit(e)} className="space-y-3 max-w-md">
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div>
            <Label>Actual end time</Label>
            <Input type="time" value={form.actualEndTime} onChange={(e) => setForm({ ...form, actualEndTime: e.target.value })} required />
          </div>
          <div>
            <Label>Engagement (optional)</Label>
            <Select value={form.engagementId} onValueChange={(v) => setForm({ ...form, engagementId: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {engagements.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required rows={4} />
          </div>
          <Button type="submit">Submit claim</Button>
        </form>
      </PanelCard>
    </AppPageContainer>
  );
}
