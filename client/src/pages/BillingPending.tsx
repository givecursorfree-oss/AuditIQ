import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Envelope, CheckCircle } from '@phosphor-icons/react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

interface PendingRow {
  engagementId: string;
  clientName: string;
  engagementTitle: string;
  filedOn: string;
  daysSinceFiling: number;
}

export default function BillingPending() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<PendingRow[]>('/billing/pending');
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function sendReminder(engagementId: string) {
    await api.post(`/billing/pending/${engagementId}/remind`);
    await load();
  }

  async function createFollowUpTask(row: PendingRow) {
    if (!user) return;
    await api.post('/tasks', {
      title: `Follow up billing — ${row.clientName}`,
      engagementId: row.engagementId,
      assigneeId: user.id,
      proposedTimeline: '2 days',
    });
  }

  return (
    <AppPageContainer>
      <PageHeader title="Pending billing" description="Engagements filed but not yet billed" />
      <PanelCard>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending billing items.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Engagement</th>
                  <th className="py-2 pr-3">Filed on</th>
                  <th className="py-2 pr-3">Days since</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.engagementId} className="border-b border-border/50">
                    <td className="py-2 pr-3">{r.clientName}</td>
                    <td className="py-2 pr-3">{r.engagementTitle}</td>
                    <td className="py-2 pr-3">
                      {new Date(r.filedOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-2 pr-3">{r.daysSinceFiling}</td>
                    <td className="py-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void sendReminder(r.engagementId)}>
                        <Envelope size={14} className="mr-1" /> Remind
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/billing?engagement=${r.engagementId}`)}>
                        <CheckCircle size={14} className="mr-1" /> Mark billed
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void createFollowUpTask(r)}>
                        Add task
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </AppPageContainer>
  );
}
