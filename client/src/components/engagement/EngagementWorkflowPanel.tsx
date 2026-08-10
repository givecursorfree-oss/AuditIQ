import { useCallback, useEffect, useState } from 'react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { PanelCard } from '@/components/layout/PanelCard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PipelineTracker from '@/components/workflow/PipelineTracker';
import { EngagementStageHistoryTable } from './EngagementStageHistoryTable';
import type { WorkflowStepView } from '@/types/workflowEngagement';

interface WorkflowMeta {
  templateId: string;
  domain: string;
  steps: WorkflowStepView[];
  stepCodes: string[];
  currentCode: string;
  currentIndex: number;
  currentLabel: string;
}

interface HistoryRow {
  id: string;
  fromStage: string | null;
  toStage: string;
  notes: string | null;
  createdAt: string;
  actor: { firstName: string; lastName: string };
}

interface Props {
  engagementId: string;
  dataRequestPercent?: number;
  onStageChanged: () => void;
}

export default function EngagementWorkflowPanel({
  engagementId,
  dataRequestPercent,
  onStageChanged,
}: Props) {
  const { user } = useAuth();
  const [meta, setMeta] = useState<WorkflowMeta | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [targetStage, setTargetStage] = useState<WorkflowStepView | null>(null);
  const [notes, setNotes] = useState('');
  const [blockers, setBlockers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [wf, hist] = await Promise.all([
      api.get<WorkflowMeta>(`/engagement-stages/${engagementId}/workflow`),
      api.get<HistoryRow[]>(`/engagement-stages/${engagementId}/history`).catch(() => ({ data: [] })),
    ]);
    setMeta(wf.data);
    setHistory(hist.data);
  }, [engagementId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openAdvance(step: WorkflowStepView) {
    setTargetStage(step);
    setNotes('');
    setError('');
    setBlockers([]);
    try {
      const { data } = await api.get<{ allowed: boolean; blockers: string[] }>(
        `/engagement-stages/${engagementId}/can-move`,
        { params: { toStage: step.label } }
      );
      setBlockers(data.blockers ?? []);
      if (!data.allowed && data.blockers?.length) {
        setError(data.blockers.join(' '));
      }
    } catch {
      /* proceed — server validates on move */
    }
  }

  async function confirmMove() {
    if (!targetStage) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/engagement-stages/${engagementId}/move`, {
        toStage: targetStage.label,
        notes: notes.trim() || undefined,
      });
      setTargetStage(null);
      await load();
      onStageChanged();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string; blockers?: string[] } } };
      setError(ax.response?.data?.error || 'Failed to update stage');
      if (ax.response?.data?.blockers) setBlockers(ax.response.data.blockers);
    } finally {
      setSubmitting(false);
    }
  }

  if (!meta) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading workflow…</p>;
  }

  const completedCodes = meta.stepCodes.slice(0, meta.currentIndex);

  return (
    <div className="space-y-4">
      <PanelCard title="Pipeline">
        <p className="text-xs text-muted-foreground mb-3">
          Current stage: <strong className="text-foreground">{meta.currentLabel}</strong>
          {user && ['Partner', 'Admin', 'Manager', 'Staff'].includes(user.role) && (
            <span> — click a stage to advance</span>
          )}
        </p>
        <PipelineTracker
          steps={meta.steps}
          currentStageCode={meta.currentCode}
          completedStageCodes={completedCodes}
          dataRequestPercent={dataRequestPercent}
          onStageClick={(step) => void openAdvance(step)}
        />
      </PanelCard>

      <PanelCard title="Stage history">
        <EngagementStageHistoryTable rows={history} />
      </PanelCard>

      <Dialog open={!!targetStage} onOpenChange={(o) => !o && setTargetStage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advance to {targetStage?.label}</DialogTitle>
            <DialogDescription>
              Confirm the stage change. Blockers must be resolved before advancing.
            </DialogDescription>
          </DialogHeader>
          {blockers.length > 0 && (
            <ul className="text-sm text-warning list-disc pl-4 space-y-1">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <Textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTargetStage(null)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmMove()} disabled={submitting}>
              {submitting ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
