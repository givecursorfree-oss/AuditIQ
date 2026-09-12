import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
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
import { CLAIM_TYPE_LABELS, TRAVEL_MODE_LABELS, formatInr } from '@/lib/expenseClaims';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { appToast } from '@/context/AppToastContext';
import { getApiErrorMessage } from '@/lib/formPayload';
import { ErrorBanner } from '@/components/layout/ErrorBanner';

type StaffOption = { id: string; firstName: string; lastName: string };
type EngOption = { id: string; title: string; client: { id: string; name: string } };
type ClientOption = { id: string; name: string };
type ApproverOption = { id: string; firstName: string; lastName: string; role: string };

type ParticipantForm = {
  userId: string;
  engagementId: string;
  clientId: string;
  workType: string;
  managerId: string;
};

export function NewStaffClaimForm() {
  const { claimType } = useParams<{ claimType: 'food' | 'travel' }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const type = claimType === 'travel' ? 'travel' : 'food';
  const isArticleRole = user?.role === 'Intern' || user?.role === 'Staff';

  const [engagements, setEngagements] = useState<EngOption[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [form, setForm] = useState({
    expensePayerId: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    travelTime: '',
    amount: '',
    description: '',
    clientId: '',
    engagementId: '',
    workType: type === 'travel' ? 'Travel' : '',
    managerId: '',
    jurisdiction: '',
    centreState: '',
    location: '',
    mapLink: '',
    visitedById: '',
    period: '',
    issue: '',
    replyFromDepartment: '',
    travelMode: '' as '' | 'cab' | 'own_vehicle',
  });
  const [participants, setParticipants] = useState<ParticipantForm[]>([
    {
      userId: '',
      engagementId: '',
      clientId: '',
      workType: type === 'travel' ? 'Travel' : '',
      managerId: '',
    },
  ]);
  const [files, setFiles] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    setMetaError(null);
    void Promise.all([
      api.get<{ engagements: EngOption[] }>('/engagements?limit=100').then((r) => setEngagements(r.data.engagements ?? [])),
      api.get<{ workTypes: string[]; activityClassifications?: string[] }>('/expense-claims/meta/work-types').then((r) => {
        const list = r.data.activityClassifications?.length ? r.data.activityClassifications : r.data.workTypes;
        setActivities(list.filter((w) => (type === 'travel' ? true : w !== 'Travel')));
      }),
      api.get<{ staff: StaffOption[] }>('/expense-claims/meta/staff').then((r) => setStaffList(r.data.staff)),
      api
        .get<{ clients: ClientOption[]; approvers: ApproverOption[]; activityClassifications: string[] }>(
          '/expense-claims/meta/form-options'
        )
        .then((r) => {
          setClients(r.data.clients ?? []);
          setApprovers(r.data.approvers ?? []);
          if (r.data.activityClassifications?.length) {
            setActivities(
              r.data.activityClassifications.filter((w) => (type === 'travel' ? true : w !== 'Travel'))
            );
          }
        }),
    ]).catch((e) => setMetaError(getApiErrorMessage(e, 'Could not load claim form data')));
  }, [type]);

  useEffect(() => {
    if (!user?.id) return;
    setParticipants((prev) => {
      if (prev.length === 1 && !prev[0].userId) {
        return [{ ...prev[0], userId: user.id }];
      }
      return prev;
    });
    setForm((f) => ({
      ...f,
      expensePayerId: f.expensePayerId || user.id,
      visitedById: f.visitedById || (type === 'travel' ? user.id : f.visitedById),
    }));
  }, [user?.id, type]);

  useEffect(() => {
    if (type !== 'travel' || !form.visitedById) return;
    setParticipants([{
      userId: form.visitedById,
      engagementId: form.engagementId,
      clientId: form.clientId,
      workType: form.workType || 'Travel',
      managerId: form.managerId,
    }]);
  }, [type, form.visitedById, form.engagementId, form.clientId, form.workType, form.managerId]);

  const engagementsForClient = useMemo(() => {
    const clientId = form.clientId || participants[0]?.clientId;
    if (!clientId) return engagements;
    return engagements.filter((e) => e.client.id === clientId);
  }, [engagements, form.clientId, participants]);

  const proofRequired = type === 'food' || form.travelMode === 'cab';

  function updateParticipant(idx: number, patch: Partial<ParticipantForm>) {
    setParticipants((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function addParticipant() {
    setParticipants((prev) => [
      ...prev,
      {
        userId: '',
        engagementId: '',
        clientId: form.clientId,
        workType: form.workType || (type === 'travel' ? 'Travel' : ''),
        managerId: form.managerId,
      },
    ]);
  }

  function removeParticipant(idx: number) {
    if (participants.length <= 1) return;
    setParticipants((prev) => prev.filter((_, i) => i !== idx));
  }

  function setClaimClient(clientId: string) {
    setForm((f) => ({ ...f, clientId, engagementId: '' }));
    setParticipants((prev) =>
      prev.map((p) => ({
        ...p,
        clientId,
        engagementId: p.engagementId && engagements.find((e) => e.id === p.engagementId)?.client.id === clientId
          ? p.engagementId
          : '',
      }))
    );
  }

  function setClaimActivity(workType: string) {
    setForm((f) => ({ ...f, workType }));
    setParticipants((prev) => prev.map((p) => ({ ...p, workType })));
  }

  function setClaimManager(managerId: string) {
    setForm((f) => ({ ...f, managerId }));
    setParticipants((prev) => prev.map((p) => ({ ...p, managerId })));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (proofRequired && !files?.length) {
      await appAlert({ title: 'Receipt required', message: 'Upload at least one image or PDF.' });
      return;
    }
    if (type === 'travel') {
      if (!form.clientId) {
        await appAlert({ title: 'Client required', message: 'Select Client Name.' });
        return;
      }
      if (
        !form.travelTime.trim() ||
        !form.jurisdiction.trim() ||
        !form.location.trim() ||
        !form.visitedById ||
        !form.period.trim() ||
        !form.issue.trim() ||
        !form.travelMode
      ) {
        await appAlert({ title: 'Incomplete', message: 'Fill all required travel fields.' });
        return;
      }
      if (!form.managerId && isArticleRole) {
        await appAlert({ title: 'Manager required', message: 'Select Manager/Partner.' });
        return;
      }
    }

    const filled = (type === 'travel'
      ? [{
          userId: form.visitedById,
          engagementId: form.engagementId,
          clientId: form.clientId,
          workType: form.workType || 'Travel',
          managerId: form.managerId,
        }]
      : participants.filter((p) => p.userId).map((p) => ({
          ...p,
          clientId: p.clientId || form.clientId,
          workType: p.workType || form.workType,
          managerId: p.managerId || form.managerId,
        }))
    );

    if (type === 'food') {
      if (filled.length === 0) {
        await appAlert({ title: 'People required', message: 'Select at least one person covered.' });
        return;
      }
      if (isArticleRole || filled.some((p) => !p.clientId)) {
        if (filled.some((p) => !p.clientId)) {
          await appAlert({ title: 'Client required', message: 'Select Client Name.' });
          return;
        }
      }
      if (isArticleRole || filled.some((p) => !p.workType?.trim())) {
        if (filled.some((p) => !p.workType?.trim())) {
          await appAlert({ title: 'Activity required', message: 'Select Activity Classification.' });
          return;
        }
      }
      if (isArticleRole || filled.some((p) => !p.managerId)) {
        if (filled.some((p) => !p.managerId)) {
          await appAlert({ title: 'Manager required', message: 'Select Manager/Partner.' });
          return;
        }
      }
    }

    const amount = parseFloat(form.amount);
    const ok = await appConfirm({
      title: 'Submit claim',
      message: `Send ${CLAIM_TYPE_LABELS[type]} claim for ${formatInr(amount)}?`,
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
        engagementId: first.engagementId || form.engagementId || undefined,
        clientId: first.clientId || form.clientId || undefined,
        workType: first.workType || (type === 'travel' ? 'Travel' : undefined),
        managerId: first.managerId || form.managerId || undefined,
        expenseDate: form.expenseDate,
        description: type === 'travel' ? undefined : form.description || undefined,
        travelTime: type === 'travel' ? form.travelTime || undefined : undefined,
        jurisdiction: type === 'travel' ? form.jurisdiction : undefined,
        centreState: type === 'travel' ? form.centreState || undefined : undefined,
        location: type === 'travel' ? form.location : undefined,
        mapLink: type === 'travel' ? form.mapLink || undefined : undefined,
        visitedById: type === 'travel' ? form.visitedById : undefined,
        period: type === 'travel' ? form.period : undefined,
        issue: type === 'travel' ? form.issue : undefined,
        replyFromDepartment: type === 'travel' ? form.replyFromDepartment || undefined : undefined,
        travelMode: type === 'travel' ? form.travelMode || undefined : undefined,
        participants: filled.map((p) => ({
          userId: p.userId,
          engagementId: p.engagementId || undefined,
          clientId: p.clientId || undefined,
          workType: p.workType,
          managerId: p.managerId || undefined,
        })),
      });
      if (files?.length) {
        try {
          const fd = new FormData();
          Array.from(files).forEach((f) => fd.append('files', f));
          await api.post(`/expense-claims/${claim.id}/receipts`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch (uploadErr) {
          await api.delete(`/expense-claims/${claim.id}`).catch(() => {});
          throw uploadErr;
        }
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
  const share = form.amount ? Math.round((parseFloat(form.amount) / count) * 100) / 100 : 0;

  return (
    <AppPageContainer>
      <PageHeader title={`New ${CLAIM_TYPE_LABELS[type]} claim`} />
      {metaError && <ErrorBanner message={metaError} className="mb-4" />}
      <PanelCard>
        <form onSubmit={(e) => void submit(e)} className="space-y-4 max-w-xl">
          <div>
            <Label>{type === 'travel' ? 'Travel Amount (INR)' : 'Amount (INR)'}</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
            {type === 'food' && count > 1 && form.amount && (
              <p className="text-xs mt-1">
                {formatInr(form.amount)} · {count} people · {formatInr(share)}/person
              </p>
            )}
          </div>

          <div>
            <Label>Client Name</Label>
            <Select value={form.clientId} onValueChange={setClaimClient} required={isArticleRole || type === 'travel'}>
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === 'travel' ? (
            <>
              <div>
                <Label>Engagement</Label>
                <Select
                  value={form.engagementId}
                  onValueChange={(v) => {
                    const eng = engagements.find((e) => e.id === v);
                    setForm((f) => ({ ...f, engagementId: v, clientId: eng?.client.id ?? f.clientId }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {engagementsForClient.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.client.name} — {e.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.expenseDate}
                    onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input
                    type="time"
                    value={form.travelTime}
                    onChange={(e) => setForm({ ...form, travelTime: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Jurisdiction</Label>
                <Input
                  value={form.jurisdiction}
                  onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Centre / State</Label>
                <Input value={form.centreState} onChange={(e) => setForm({ ...form, centreState: e.target.value })} />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Map Link</Label>
                <Input value={form.mapLink} onChange={(e) => setForm({ ...form, mapLink: e.target.value })} />
              </div>
              <div>
                <Label>Visited By</Label>
                <Select
                  value={form.visitedById}
                  onValueChange={(v) => setForm({ ...form, visitedById: v })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Period</Label>
                <Input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} required />
              </div>
              <div>
                <Label>Issue</Label>
                <Textarea value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} required />
              </div>
              <div>
                <Label>Reply from Department</Label>
                <Textarea
                  value={form.replyFromDepartment}
                  onChange={(e) => setForm({ ...form, replyFromDepartment: e.target.value })}
                />
              </div>
              <div>
                <Label>Travel Mode</Label>
                <Select
                  value={form.travelMode}
                  onValueChange={(v) => setForm({ ...form, travelMode: v as 'cab' | 'own_vehicle' })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRAVEL_MODE_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Manager / Partner</Label>
                <Select value={form.managerId} onValueChange={setClaimManager} required={isArticleRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select approver" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvers.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.firstName} {a.lastName} ({a.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Paid by</Label>
                <Select value={form.expensePayerId} onValueChange={(v) => setForm({ ...form, expensePayerId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Self" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Activity Classification</Label>
                <Select value={form.workType} onValueChange={setClaimActivity} required={isArticleRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select activity" />
                  </SelectTrigger>
                  <SelectContent>
                    {activities.map((w) => (
                      <SelectItem key={w} value={w}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Manager / Partner</Label>
                <Select value={form.managerId} onValueChange={setClaimManager} required={isArticleRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select approver" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvers.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.firstName} {a.lastName} ({a.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Paid by</Label>
                <Select value={form.expensePayerId} onValueChange={(v) => setForm({ ...form, expensePayerId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Self" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.expenseDate}
                  onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>People covered</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addParticipant}>
                    Add
                  </Button>
                </div>
                {participants.map((p, idx) => (
                  <div key={idx} className="grid gap-2 border rounded-lg p-3 sm:grid-cols-2">
                    <div>
                      <Label>Person</Label>
                      <Select value={p.userId} onValueChange={(v) => updateParticipant(idx, { userId: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {staffList.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.firstName} {s.lastName}
                            </SelectItem>
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
                          updateParticipant(idx, {
                            engagementId: v,
                            clientId: eng?.client.id ?? (p.clientId || form.clientId),
                          });
                          if (eng?.client.id) setForm((f) => ({ ...f, clientId: eng.client.id }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          {engagementsForClient.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.client.name} — {e.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {participants.length > 1 && (
                      <div className="flex items-end">
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeParticipant(idx)}>
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div>
            <Label>Receipt / proof</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
              capture="environment"
              multiple
              onChange={(e) => setFiles(e.target.files)}
              required={proofRequired}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/claims">Cancel</Link>
            </Button>
          </div>
        </form>
      </PanelCard>
    </AppPageContainer>
  );
}
