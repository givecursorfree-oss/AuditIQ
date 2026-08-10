import { useState } from 'react';
import {
  AlertTriangle,
  Mail,
  UserMinus,
  Award,
  Receipt,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { PanelCard } from '../layout/PanelCard';
import { DashboardRecentActivity } from './DashboardRecentActivity';
import type { ActivityItem } from '@/types';
import { NavCountBadge } from '../ui/nav-count-badge';
import { engagementHubPath } from '@/lib/engagementDeepLinks';

function BriefingCard({
  icon: Icon,
  label,
  count,
  items = [],
  links = [],
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  items?: string[];
  links?: { label: string; href: string }[];
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const interactive = count > 0 || !!onClick || links.length > 0;

  const handlePrimaryClick = () => {
    if (onClick) onClick();
    else if (links[0]) navigate(links[0].href);
    else if (count > 0) setExpanded(!expanded);
  };

  return (
    <article
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-card',
        interactive && 'hover:bg-muted/20 transition-colors'
      )}
    >
      <button
        type="button"
        className="w-full text-left"
        disabled={!interactive}
        onClick={interactive ? handlePrimaryClick : undefined}
      >
        <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            {label}
            <NavCountBadge count={count} className="ml-0" />
          </p>
          <p className="text-2xl font-medium text-foreground">{count.toLocaleString('en-IN')}</p>
        </div>
        </div>
      </button>
      {(expanded || links.length > 0) && links.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          {links.slice(0, 5).map((link) => (
            <button
              key={link.href}
              type="button"
              className="block w-full text-left text-xs text-primary hover:underline truncate"
              onClick={(e) => {
                e.stopPropagation();
                navigate(link.href);
              }}
            >
              {link.label}
            </button>
          ))}
          {links.length > 5 && <div className="text-xs text-muted-foreground">+{links.length - 5} more</div>}
        </div>
      )}
      {items.length > 0 && links.length === 0 && (
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          {items.slice(0, 5).map((item) => (
            <div key={item} className="truncate">
              {item}
            </div>
          ))}
          {items.length > 5 && <div>+{items.length - 5} more</div>}
        </div>
      )}
    </article>
  );
}

interface DashboardExtraPanelsProps {
  isLeadership: boolean;
  showCompliance: boolean;
  isClient: boolean;
  briefing: any;
  compliance: {
    statutory: { title: string; dueDate: string; daysAway: number; rag: string }[];
    engagementDeadlines: {
      id: string;
      title: string;
      dueDate: string;
      engagement: { id: string; title: string; client: { name: string } };
    }[];
  } | null;
  openClientQueries: {
    openCount: number;
    recent: {
      id: string;
      subject: string;
      engagementId: string;
      engagementTitle: string;
      clientName: string;
    }[];
  } | null;
  recentActivity: ActivityItem[];
  /** Render only the daily briefing grid (used above the fold on dashboard). */
  briefingOnly?: boolean;
  /** Render only open client queries panel. */
  queriesOnly?: boolean;
}

export function DashboardExtraPanels({
  isLeadership,
  showCompliance,
  isClient,
  briefing,
  compliance,
  openClientQueries,
  recentActivity,
  briefingOnly = false,
  queriesOnly = false,
}: DashboardExtraPanelsProps) {
  const navigate = useNavigate();

  if (briefingOnly) {
    if (!isLeadership || !briefing) return null;
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Daily briefing</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <BriefingCard
            icon={AlertTriangle}
            label="At-Risk Engagements"
            count={briefing.summary?.atRiskCount || 0}
            links={(briefing.engagementsAtRisk ?? []).map(
              (e: { id: string; client?: { name: string }; title: string; currentStage: string }) => ({
                label: `${e.client?.name} — ${e.title} (${e.currentStage})`,
                href: engagementHubPath(e.id, 'workflow'),
              })
            )}
            onClick={() => {
              const first = briefing.engagementsAtRisk?.[0];
              if (first?.id) navigate(engagementHubPath(first.id, 'workflow'));
              else navigate('/engagements');
            }}
          />
          <BriefingCard
            icon={Mail}
            label="Pending Documents"
            count={briefing.summary?.pendingDocsCount || 0}
            links={(briefing.pendingDocuments ?? []).map(
              (d: { engagement?: { id: string; client?: { name: string } }; title: string }) => ({
                label: `${d.engagement?.client?.name}: ${d.title}`,
                href: d.engagement?.id
                  ? engagementHubPath(d.engagement.id, 'documents')
                  : '/engagements',
              })
            )}
            onClick={() => {
              const first = briefing.pendingDocuments?.[0];
              const engId = first?.engagement?.id;
              if (engId) navigate(engagementHubPath(engId, 'documents'));
            }}
          />
          <BriefingCard
            icon={UserMinus}
            label="Inactive Employees"
            count={briefing.summary?.inactiveCount || 0}
            items={briefing.inactiveEmployees?.map(
              (e: { firstName: string; lastName: string; role: string }) =>
                `${e.firstName} ${e.lastName} (${e.role})`
            )}
            onClick={() => navigate('/attendance')}
          />
          <BriefingCard
            icon={Award}
            label="UDIN Pending"
            count={briefing.summary?.udinPendingCount || 0}
            links={(briefing.udinPending ?? []).map(
              (e: { id: string; client?: { name: string }; title: string }) => ({
                label: `${e.client?.name} — ${e.title}`,
                href: engagementHubPath(e.id, 'workflow'),
              })
            )}
            onClick={() => {
              const first = briefing.udinPending?.[0];
              if (first?.id) navigate(engagementHubPath(first.id, 'workflow'));
            }}
          />
          <BriefingCard
            icon={Receipt}
            label="Uninvoiced Closures"
            count={briefing.summary?.uninvoicedCount || 0}
            items={briefing.uninvoicedClosures?.map(
              (e: { client?: { name: string }; title: string }) =>
                `${e.client?.name} — ${e.title}`
            )}
            onClick={() => navigate('/billing')}
          />
        </div>
      </div>
    );
  }

  if (queriesOnly) {
    if (!openClientQueries || openClientQueries.openCount === 0) return null;
    return (
      <PanelCard
        title="Open client audit queries"
        action={
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {openClientQueries.openCount} open
          </span>
        }
      >
        <ul className="space-y-2 px-4 pb-4">
          {openClientQueries.recent.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => navigate(engagementHubPath(q.engagementId, 'queries'))}
                className="w-full rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="truncate text-sm font-medium text-foreground">{q.subject}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {q.clientName} · {q.engagementTitle}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </PanelCard>
    );
  }

  return (
    <>
      {showCompliance && compliance && (
        <PanelCard title="Compliance calendar" action={<span className="text-xs text-muted-foreground shrink-0">Due in next 30 days</span>}>
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-border px-4 pt-4 pb-4">
            <section className="min-w-0 lg:pr-6 pb-5 lg:pb-0 border-b lg:border-b-0 border-border">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Statutory
              </h4>
              <ul className="divide-y divide-border">
                {compliance.statutory?.map((s) => (
                  <li
                    key={s.title}
                    className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0"
                  >
                    <span className="min-w-0 text-foreground">{s.title}</span>
                    <span
                      className={cn(
                        'shrink-0 text-xs font-medium px-2 py-0.5 rounded-md tabular-nums',
                        s.rag === 'red'
                          ? 'bg-destructive/10 text-destructive'
                          : s.rag === 'amber'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {new Date(s.dueDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {s.daysAway >= 0 ? ` · ${s.daysAway}d` : ' · overdue'}
                    </span>
                  </li>
                ))}
                {(!compliance.statutory || compliance.statutory.length === 0) && (
                  <li className="py-3 text-sm text-muted-foreground leading-relaxed">
                    No statutory items in the next 30 days
                  </li>
                )}
              </ul>
            </section>
            <section className="min-w-0 lg:pl-6 pt-5 lg:pt-0">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Engagement deadlines
              </h4>
              <ul className="divide-y divide-border">
                {compliance.engagementDeadlines?.slice(0, 6).map((d) => (
                  <li key={d.id} className="py-3 first:pt-0">
                    <button
                      type="button"
                      onClick={() => navigate(engagementHubPath(d.engagement.id, 'workflow'))}
                      className="w-full text-left flex items-center justify-between gap-3 text-sm hover:text-primary transition-colors"
                    >
                      <span className="min-w-0 truncate text-foreground pr-1">
                        {d.engagement.client.name} — {d.title}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                        {new Date(d.dueDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </button>
                  </li>
                ))}
                {(!compliance.engagementDeadlines ||
                  compliance.engagementDeadlines.length === 0) && (
                  <li className="py-3 text-sm text-muted-foreground leading-relaxed">
                    No engagement deadlines in the next 30 days on your assignments
                  </li>
                )}
              </ul>
            </section>
          </div>
        </PanelCard>
      )}

      {!isClient && recentActivity.length > 0 && (
        <DashboardRecentActivity activities={recentActivity} />
      )}
    </>
  );
}
