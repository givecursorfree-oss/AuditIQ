import type { ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  MessageSquare,
  ClipboardList,
  GitBranch,
  FileSignature,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PanelCard } from '../layout/PanelCard';
import { NavCountBadge } from '../ui/nav-count-badge';
import { useClientPortal } from './ClientPortalContext';

type PriorityCard = {
  id: string;
  label: string;
  detail?: string;
  count: number;
  tab?: string;
  href?: string;
  icon: ElementType;
  urgent?: boolean;
};

export function ClientPortalPriorities() {
  const navigate = useNavigate();
  const {
    setActiveTab,
    pendingRequests,
    pendingDocsCount,
    openAuditQueryCount,
    pendingLetters,
    pendingServiceRequests,
    pendingActivationEngagements,
    activeCount,
  } = useClientPortal();

  const cards: PriorityCard[] = [];

  if (pendingActivationEngagements.length > 0) {
    cards.push({
      id: 'activation',
      label: 'Awaiting activation',
      detail: 'Firm is setting up your engagement',
      count: pendingActivationEngagements.length,
      tab: 'tracking',
      icon: GitBranch,
      urgent: true,
    });
  }

  if (pendingLetters.length > 0) {
    cards.push({
      id: 'letters',
      label: 'Sign engagement letter',
      detail: 'Review and accept to proceed',
      count: pendingLetters.length,
      tab: 'requests',
      icon: FileSignature,
      urgent: true,
    });
  }

  const uploadCount = Math.max(pendingRequests, pendingDocsCount);
  if (uploadCount > 0) {
    cards.push({
      id: 'uploads',
      label: 'Documents to upload',
      detail: 'Your auditor requested files',
      count: uploadCount,
      tab: 'documents',
      icon: FileText,
      urgent: true,
    });
  }

  if (openAuditQueryCount > 0) {
    cards.push({
      id: 'queries',
      label: 'Audit queries',
      detail: 'Respond to your engagement team',
      count: openAuditQueryCount,
      tab: 'queries',
      icon: MessageSquare,
      urgent: true,
    });
  }

  if (pendingServiceRequests.length > 0) {
    cards.push({
      id: 'requests',
      label: 'Service requests',
      detail: 'Track status with your firm',
      count: pendingServiceRequests.length,
      tab: 'requests',
      icon: ClipboardList,
    });
  }

  const shortcuts: PriorityCard[] =
    cards.length === 0
      ? [
          {
            id: 'track',
            label: 'Track progress',
            detail: activeCount > 0 ? `${activeCount} active engagement(s)` : 'See audit stages',
            count: activeCount,
            tab: 'tracking',
            icon: GitBranch,
          },
          {
            id: 'docs',
            label: 'Documents',
            detail: 'Upload files or download deliverables',
            count: 0,
            tab: 'documents',
            icon: FileText,
          },
          {
            id: 'messages',
            label: 'Message your firm',
            detail: 'Secure chat in the sidebar',
            count: 0,
            href: '/client/messages',
            icon: MessageSquare,
          },
        ]
      : [];

  const display = cards.length > 0 ? cards : shortcuts;

  return (
    <div data-onboard="client-priorities">
    <PanelCard
      title="What needs your attention"
      className="border-primary/20 bg-primary/[0.02]"
    >
      {cards.length === 0 && (
        <p className="flex items-center gap-2 px-4 pb-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 shrink-0 text-primary" />
          You&apos;re all caught up. Use the shortcuts below anytime.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
        {display.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                if (card.href) navigate(card.href);
                else if (card.tab) setActiveTab(card.tab);
              }}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left shadow-card transition-colors',
                'hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                card.urgent ? 'border-primary/30 bg-card' : 'border-border bg-card'
              )}
            >
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg border',
                  card.urgent ? 'border-primary/25 bg-primary/10' : 'border-border bg-muted/30'
                )}
              >
                <Icon className={cn('size-4', card.urgent ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{card.label}</p>
                {card.detail ? (
                  <p className="truncate text-xs text-muted-foreground">{card.detail}</p>
                ) : null}
              </div>
              {card.count > 0 ? <NavCountBadge count={card.count} className="!ml-0 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </PanelCard>
    </div>
  );
}
