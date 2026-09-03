import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import api from '../services/api';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import PageLoading from '../components/layout/PageLoading';
import { EmptyState } from '../components/layout/StatePanels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SERVICE_CATALOG } from '@/lib/workflowCatalog';

type PortfolioTeamMember = { id: string; name: string; initials: string | null; teamRole: string | null };
type PortfolioRow = {
  id: string;
  clientId: string;
  clientName: string;
  gstin: string | null;
  pan: string | null;
  title: string;
  status: string;
  currentStage: string;
  deadline: string | null;
  financialYear: string;
  isRecurring: boolean;
  latestPeriod: { label: string; currentStage: string; dueDate: string | null } | null;
  periodsCount: number;
  documentCount: number;
  team: PortfolioTeamMember[];
};
type PortfolioResponse = {
  service: string;
  serviceName: string;
  clientCount: number;
  rows: PortfolioRow[];
};

// Services that span many clients in one window (recurring / high-volume).
const PORTFOLIO_SERVICES = SERVICE_CATALOG.filter((s) =>
  ['GST_MONTHLY_RETURNS', 'GSTR_1', 'GSTR_3B', 'ITR_JULY', 'ITR_NON_TP', 'TDS_REMITTANCE', 'TDS_QUARTERLY', 'ADVANCE_TAX'].includes(
    s.code
  )
);

export default function EngagementPortfolio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const service = searchParams.get('service') || 'GST_MONTHLY_RETURNS';
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api
      .get<PortfolioResponse>(`/engagements/portfolio?service=${encodeURIComponent(service)}`)
      .then(({ data }) => setData(data))
      .catch(() => {
        setData(null);
        setLoadError('Failed to load.');
      })
      .finally(() => setLoading(false));
  }, [service]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  return (
    <AppPageContainer>
      <PageHeader
        title="Engagement Portfolio"
        description="Multi-client single-window view — track one service across every client"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/engagements" className="gap-2">
              <ArrowLeft size={16} /> All engagements
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {PORTFOLIO_SERVICES.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => setSearchParams({ service: s.code })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              s.code === service
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface text-foreground-muted hover:bg-hover-bg'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoading />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title="No clients for this service"
          description="No engagements found for the selected service."
        />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {data.serviceName}
            </h2>
            <Badge variant="secondary">{data.clientCount} clients</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground-muted border-b border-border">
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Current stage</th>
                  <th className="px-4 py-2 font-medium">Latest period</th>
                  <th className="px-4 py-2 font-medium">Team</th>
                  <th className="px-4 py-2 font-medium">Docs</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 hover:bg-hover-bg">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">{row.clientName}</div>
                      <div className="text-xs text-foreground-muted">
                        {row.gstin || row.pan || row.financialYear}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline">{row.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">
                      {row.latestPeriod?.currentStage || row.currentStage}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">
                      {row.latestPeriod
                        ? `${row.latestPeriod.label}${
                            row.latestPeriod.dueDate
                              ? ` · due ${new Date(row.latestPeriod.dueDate).toLocaleDateString('en-IN')}`
                              : ''
                          }`
                        : row.deadline
                          ? new Date(row.deadline).toLocaleDateString('en-IN')
                          : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.team.length > 0 ? (
                        <span className="text-xs text-foreground-muted">
                          {row.team.map((t) => t.name).join(', ')}
                        </span>
                      ) : (
                        <span className="text-xs text-foreground-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">{row.documentCount}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link to={`/engagements/${row.id}`} className="text-primary hover:underline text-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppPageContainer>
  );
}
