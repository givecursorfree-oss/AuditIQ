import { FileText, ChatCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { MetricCard } from '../layout/PanelCard';

const RAG_VALUE_STYLES = {
  green: 'text-success',
  amber: 'text-warning',
  red: 'text-danger',
  neutral: 'text-foreground',
} as const;

export type EngagementStatusMetrics = {
  currentStage: string;
  deadline: string | null;
  deadlineRag: keyof typeof RAG_VALUE_STYLES;
  checklistPct: number;
  checklistDone: number;
  checklistTotal: number;
  openObservations: number;
  pendingClientDocs: number;
  openClientQueries: number;
  udin: string | null;
  filedAt: string | null;
};

interface EngagementStatusStripProps {
  metrics: EngagementStatusMetrics;
  onStageClick?: () => void;
  onDocumentsClick?: () => void;
  onQueriesClick?: () => void;
}

export function EngagementStatusStrip({
  metrics,
  onStageClick,
  onDocumentsClick,
  onQueriesClick,
}: EngagementStatusStripProps) {
  const rag = metrics.deadlineRag ?? 'neutral';

  return (
    <section aria-label="Engagement status" className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Status & tracking
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <button
          type="button"
          onClick={onStageClick}
          className="rounded-xl border border-border bg-card p-3 text-left shadow-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stage</p>
          <p className="truncate text-lg font-semibold text-foreground sm:text-xl">{metrics.currentStage}</p>
        </button>
        <MetricCard
          title="Deadline"
          value={
            metrics.deadline
              ? new Date(metrics.deadline).toLocaleDateString('en-IN')
              : '—'
          }
          className="!p-3"
          valueClassName={RAG_VALUE_STYLES[rag]}
        />
        <button
          type="button"
          onClick={onDocumentsClick}
          className="rounded-xl border border-border bg-card p-3 text-left shadow-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Checklist</p>
          <p className="text-lg font-semibold text-foreground sm:text-xl">{metrics.checklistPct}%</p>
          <p className="text-xs text-muted-foreground">
            {metrics.checklistDone}/{metrics.checklistTotal}
          </p>
        </button>
        <MetricCard title="Observations" value={metrics.openObservations} className="!p-3" />
        <button
          type="button"
          onClick={onDocumentsClick}
          className={cn(
            'rounded-xl border bg-card p-3 text-left shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            metrics.pendingClientDocs > 0
              ? 'border-warning/40 hover:border-warning/60'
              : 'border-border hover:border-primary/40'
          )}
        >
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <FileText size={12} aria-hidden /> Pending docs
          </p>
          <p className="text-lg font-semibold text-foreground sm:text-xl">{metrics.pendingClientDocs}</p>
        </button>
        <button
          type="button"
          onClick={onQueriesClick}
          className={cn(
            'rounded-xl border bg-card p-3 text-left shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            metrics.openClientQueries > 0
              ? 'border-primary/30 hover:border-primary/50'
              : 'border-border hover:border-primary/40'
          )}
        >
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ChatCircle size={12} aria-hidden /> Open queries
          </p>
          <p className="text-lg font-semibold text-foreground sm:text-xl">{metrics.openClientQueries}</p>
        </button>
        <MetricCard
          title="UDIN"
          value={metrics.udin || (metrics.filedAt ? 'Filed' : 'Pending')}
          className="!p-3"
        />
      </div>
    </section>
  );
}
