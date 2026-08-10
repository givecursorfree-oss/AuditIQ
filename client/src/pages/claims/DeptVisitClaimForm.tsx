import { useEffect, useState } from 'react';
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

export function DeptVisitClaimForm() {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    department: 'GST_office',
    departmentDetails: '',
    purpose: '',
    engagementId: '',
    departureTime: '10:00',
    returnTime: '14:00',
    travelExpense: '',
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
    await api.post('/claims/dept-visit', {
      ...form,
      travelExpense: form.travelExpense ? Number(form.travelExpense) : undefined,
    });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AppPageContainer>
        <PageHeader title="Department visit claim" />
        <p className="text-sm">Claim submitted.</p>
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer>
      <PageHeader title="Department visit claim" />
      <PanelCard>
        <form onSubmit={(e) => void submit(e)} className="space-y-3 max-w-md">
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div>
            <Label>Department</Label>
            <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GST_office">GST office</SelectItem>
                <SelectItem value="Income_Tax">Income Tax</SelectItem>
                <SelectItem value="TRACES">TRACES</SelectItem>
                <SelectItem value="ROC">ROC</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Location details</Label>
            <Input value={form.departmentDetails} onChange={(e) => setForm({ ...form, departmentDetails: e.target.value })} required />
          </div>
          <div>
            <Label>GST / IT engagement</Label>
            <Select value={form.engagementId} onValueChange={(v) => setForm({ ...form, engagementId: v })}>
              <SelectTrigger><SelectValue placeholder="Required" /></SelectTrigger>
              <SelectContent>
                {engagements.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Purpose</Label>
            <Textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Departure</Label>
              <Input type="time" value={form.departureTime} onChange={(e) => setForm({ ...form, departureTime: e.target.value })} />
            </div>
            <div>
              <Label>Return</Label>
              <Input type="time" value={form.returnTime} onChange={(e) => setForm({ ...form, returnTime: e.target.value })} />
            </div>
          </div>
          <Button type="submit" disabled={!form.engagementId}>Submit</Button>
        </form>
      </PanelCard>
    </AppPageContainer>
  );
}
