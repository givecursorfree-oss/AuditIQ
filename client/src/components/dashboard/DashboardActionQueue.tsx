import { ClipboardList, UserPlus, Clock, ArrowRight, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PanelCard } from '../layout/PanelCard';
import { LoadingCenter } from '../layout/StatePanels';
import { Button } from '../ui/button';
import { NavCountBadge } from '../ui/nav-count-badge';
import api from '@/services/api';
import { useNavBadgesOptional } from '@/context/NavBadgesContext';

export type ActionQueueItem = {
  id: string;
  kind: 'new_request' | 'letter_signed' | 'awaiting_signature';
  priority: number;
  title: string;
  subtitle: string;
  clientName: string;
  submittedAt: string | null;
  serviceLabels: string[];
  href: string;
  actionLabel: string;
};

export type DashboardActionQueueData = {
  items: ActionQueueItem[];
  summary: {
    total: number;
    actionable: number;
    newRequests: number;
    letterSigned: number;
    awaitingSignature: number;
  };
};

import { formatRelativeTime } from '@/lib/formatRelativeTime';

async function ackForItem(kind: ActionQueueItem['kind']) {
  const scopes =
    kind === 'new_request'
      ? ['requests', 'dashboard']
      : kind === 'letter_signed'
        ? ['letters', 'workflow', 'dashboard']
        : ['workflow'];
  await api.post('/nav-badges/ack', { scopes }).catch(() => {});
}

interface DashboardActionQueueProps {
  queue: DashboardActionQueueData | null;
  loading?: boolean;
}

export function DashboardActionQueue({ queue, loading }: DashboardActionQueueProps) {
  const navigate = useNavigate();
  const navBadges = useNavBadgesOptional();

  if (loading) {
    return (
      <PanelCard title="Client requests">
        <LoadingCenter label="Loading action queue…" />
      </PanelCard>
    );
  }

  if (!queue || queue.summary.total === 0) return null;

  const actionable = queue.items.filter((i) => i.kind !== 'awaiting_signature');
  const waiting = queue.items.filter((i) => i.kind === 'awaiting_signature');

  const go = async (item: ActionQueueItem) => {
    await ackForItem(item.kind);
    void navBadges?.refresh();
    navigate(item.href);
  };

  return (
    <PanelCard
      title="Client requests"
      action={
        <div className="flex items-center gap-2">
          {queue.summary.actionable > 0 && (
            <NavCountBadge count={queue.summary.actionable} className="ml-0" />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await api.post('/nav-badges/ack', { scopes: ['requests', 'dashboard'] });
              void navBadges?.refresh();
              navigate('/requests');
            }}
          >
            View all
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      }
    >
      {actionable.length > 0 && (
        <div className="pb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Needs your action
          </p>
          <ul className="space-y-2">
            {actionable.map((item) => {
              const Icon = item.kind === 'new_request' ? ClipboardList : UserPlus;
              const isApprove = item.kind === 'new_request';
              return (
                <li key={item.id}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 shadow-card">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{item.clientName}</p>
                        <p className="text-sm text-muted-foreground truncate">{item.subtitle}</p>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          {isApprove ? (
                            <span className="font-medium text-primary">Approve to continue</span>
                          ) : (
                            <span>Assign partner and team</span>
                          )}
                          {item.submittedAt && (
                            <>
                              <span aria-hidden>·</span>
                              <Clock className="size-3" />
                              {formatRelativeTime(item.submittedAt)}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0 w-full sm:w-auto"
                      variant="default"
                      onClick={() => void go(item)}
                    >
                      {item.actionLabel}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {waiting.length > 0 && (
        <div className="border-t border-border pb-2 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-2">
            Waiting on client
          </p>
          <ul className="space-y-1">
            {waiting.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void go(item)}
                  className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <PenLine className="size-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{item.clientName}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PanelCard>
  );
}
