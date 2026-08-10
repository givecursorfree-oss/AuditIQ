import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { DashboardData, Deadline } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNavBadges } from '../context/NavBadgesContext';
import PageLoading from '../components/layout/PageLoading';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import AdminPresenceDashboard from '../components/time/AdminPresenceDashboard';
import { DashboardWelcome } from '../components/dashboard/DashboardWelcome';
import { DashboardStatsCards } from '../components/dashboard/DashboardStatsCards';
import { DashboardTodaysTasks } from '../components/dashboard/DashboardTodaysTasks';
import { DashboardPerformanceChart } from '../components/dashboard/DashboardPerformanceChart';
import { DashboardEngagementsTable } from '../components/dashboard/DashboardEngagementsTable';
import { DashboardExtraPanels } from '../components/dashboard/DashboardExtraPanels';
import {
  DashboardActionQueue,
  type DashboardActionQueueData,
} from '../components/dashboard/DashboardActionQueue';
import { DashboardPriorities } from '../components/dashboard/DashboardPriorities';
import {
  buildChartPoints,
  buildEngagementRows,
  buildPerformanceMetrics,
  buildStatCards,
  buildTaskRows,
  countTasksDueToday,
  countUpcomingDeadlinesThisWeek,
} from '../components/dashboard/mapDashboardData';
import { engagementHubPath, engagementTasksPath } from '@/lib/engagementDeepLinks';

const PARTNER_ADMIN_ROLES = ['Admin', 'Partner'];
const FIRM_LEADERSHIP_ROLES = ['Admin', 'Partner', 'Manager'];

export default function Dashboard() {
  const { user } = useAuth();
  const { badges } = useNavBadges();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [chartData, setChartData] = useState<{ month: string; completed: number; active: number }[]>([]);
  const [briefing, setBriefing] = useState<any>(null);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<{
    statutory: { title: string; dueDate: string; daysAway: number; rag: string }[];
    engagementDeadlines: {
      id: string;
      title: string;
      dueDate: string;
      engagement: { id: string; title: string; client: { name: string } };
    }[];
  } | null>(null);
  const [openClientQueries, setOpenClientQueries] = useState<{
    openCount: number;
    recent: {
      id: string;
      subject: string;
      engagementId: string;
      engagementTitle: string;
      clientName: string;
      createdAt: string;
    }[];
  } | null>(null);
  const [actionQueue, setActionQueue] = useState<DashboardActionQueueData | null>(null);
  const [actionQueueLoading, setActionQueueLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    setLoadError(null);
    const role = user?.role || '';
    const isPartnerAdmin = PARTNER_ADMIN_ROLES.includes(role);
    const isFirmLeadership = FIRM_LEADERSHIP_ROLES.includes(role);
    const isEmployee = ['Manager', 'Staff', 'Intern'].includes(role);
    const isFirmStaff = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'].includes(role);
    const showCompliance = ['Admin', 'Partner', 'Manager'].includes(role);
    if (isFirmLeadership) setActionQueueLoading(true);

    const fetches: Promise<any>[] = [
      api.get('/dashboard'),
      api.get('/dashboard/deadlines'),
      api.get('/dashboard/chart-data'),
    ];
    if (isPartnerAdmin) fetches.push(api.get('/dashboard/briefing').catch(() => ({ data: null })));
    if (isFirmLeadership) {
      fetches.push(
        api.get<DashboardActionQueueData>('/dashboard/action-queue').catch(() => ({ data: null }))
      );
    }
    if (isFirmStaff) fetches.push(api.get('/tasks?scope=mine&status=Open').catch(() => ({ data: { tasks: [] } })));
    if (showCompliance) {
      fetches.push(api.get('/dashboard/compliance-calendar').catch(() => ({ data: null })));
      fetches.push(
        api.get('/client-queries/open-summary').catch(() => ({
          data: { openCount: 0, recent: [] },
        }))
      );
    }

    Promise.all(fetches)
      .then((results) => {
        const [dashRes, dlRes, chartRes, ...extras] = results;
        setData(dashRes.data);
        setDeadlines(Array.isArray(dlRes.data) ? dlRes.data : []);
        setChartData(Array.isArray(chartRes.data) ? chartRes.data : []);
        let ei = 0;
        if (isPartnerAdmin) {
          setBriefing(extras[ei]?.data ?? null);
          ei += 1;
        }
        if (isFirmLeadership) {
          setActionQueue(extras[ei]?.data ?? null);
          ei += 1;
        }
        if (isFirmStaff) {
          setMyTasks(extras[ei]?.data?.tasks || extras[ei]?.data || []);
          ei += 1;
        }
        if (showCompliance) {
          setCompliance(extras[ei]?.data ?? null);
          ei += 1;
          setOpenClientQueries(extras[ei]?.data ?? { openCount: 0, recent: [] });
        }
      })
      .catch(() => {
        setLoadError('Unable to load dashboard data. Check your connection and try again.');
      })
      .finally(() => {
        setLoading(false);
        setActionQueueLoading(false);
      });
  }, [user?.role]);

  useEffect(() => {
    setLoading(true);
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadDashboard();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [loadDashboard]);

  const role = user?.role || '';
  const isPartnerAdmin = PARTNER_ADMIN_ROLES.includes(role);
  const isFirmLeadership = FIRM_LEADERSHIP_ROLES.includes(role);
  const isTeam = ['Manager', 'Staff', 'Intern'].includes(role);
  const isClient = role === 'Client';
  const isIntern = role === 'Intern';
  const isFirmStaff = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'].includes(role);
  const showCompliance = ['Admin', 'Partner', 'Manager'].includes(role);

  const taskRows = useMemo(() => buildTaskRows(myTasks, deadlines), [myTasks, deadlines]);
  const engagementRows = useMemo(() => {
    const list = data?.activeEngagements ?? [];
    return buildEngagementRows(list);
  }, [data?.activeEngagements]);
  const chartPoints = useMemo(() => buildChartPoints(chartData), [chartData]);
  const performance = useMemo(
    () => buildPerformanceMetrics(chartData, data?.stats),
    [chartData, data?.stats]
  );

  const statCards = useMemo(() => {
    const all = buildStatCards(data?.stats, data?.engagementsByStatus, chartData, {
      isClient,
      isIntern,
      showClients: !isClient,
    });
    const withBadges = all.map((stat) => {
      if (stat.title === 'Total Clients') {
        return { ...stat, attentionCount: badges.incomingClients, navHref: '/clients?tab=incoming' };
      }
      if (stat.title === 'Total Projects') {
        return { ...stat, attentionCount: badges.workflowAttention, navHref: '/engagements' };
      }
      if (stat.title === 'In Reviews') {
        return { ...stat, attentionCount: badges.approvals, navHref: '/engagements' };
      }
      if (stat.title === 'Overdue Deadlines') {
        return {
          ...stat,
          attentionCount: stat.value > 0 ? stat.value : 0,
          navHref: '/compliance-calendar',
        };
      }
      if (stat.title === 'Open Tasks') {
        return { ...stat, attentionCount: badges.openClientQueries, navHref: '/clients' };
      }
      return stat;
    });
    return withBadges.filter((s) => !s.hidden).slice(0, 4);
  }, [data?.stats, data?.engagementsByStatus, chartData, isClient, isIntern, badges]);

  const tasksDueToday = useMemo(() => countTasksDueToday(myTasks), [myTasks]);
  const upcomingThisWeek = useMemo(() => countUpcomingDeadlinesThisWeek(deadlines), [deadlines]);

  const overdueCount =
    data?.stats?.overdueDeadlines ?? deadlines.filter((d) => d.isOverdue).length;

  if (loading) {
    return <PageLoading className="h-64" />;
  }

  return (
    <AppPageContainer>
      {loadError && (
        <div
          role="alert"
          className="mb-4 flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-destructive">{loadError}</p>
          <button type="button" className="btn-primary shrink-0" onClick={() => { setLoading(true); loadDashboard(); }}>
            Retry
          </button>
        </div>
      )}
      <DashboardWelcome
        userName={user?.firstName || 'there'}
        tasksDueToday={tasksDueToday || taskRows.length}
        overdueTasks={overdueCount}
        upcomingDeadlines={upcomingThisWeek}
        attentionCount={badges.dashboardAttention}
        showAttentionBadge={!isFirmLeadership}
        showActions={!isClient}
        onExport={() => navigate('/reports')}
        onNew={() => navigate('/engagements')}
      />

      {!isClient && (
        <DashboardPriorities
          role={role}
          badges={badges}
          tasksDueToday={tasksDueToday || taskRows.length}
          overdueDeadlines={overdueCount}
          briefingSummary={
            briefing?.summary
              ? {
                  atRiskCount: briefing.summary.atRiskCount,
                  pendingDocsCount: briefing.summary.pendingDocsCount,
                  udinPendingCount: briefing.summary.udinPendingCount,
                }
              : null
          }
          firstAtRiskEngagementId={briefing?.engagementsAtRisk?.[0]?.id ?? null}
        />
      )}

      {isFirmLeadership && (
        <div className="mb-4 sm:mb-6" data-onboard="dashboard-action-queue">
          <DashboardActionQueue queue={actionQueue} loading={actionQueueLoading && !actionQueue} />
        </div>
      )}

      {isPartnerAdmin && briefing && (
        <DashboardExtraPanels
          isLeadership={isPartnerAdmin}
          showCompliance={false}
          isClient={isClient}
          briefing={briefing}
          compliance={null}
          openClientQueries={null}
          recentActivity={[]}
          briefingOnly
        />
      )}

      {showCompliance && openClientQueries && openClientQueries.openCount > 0 && (
        <DashboardExtraPanels
          isLeadership={false}
          showCompliance={false}
          isClient={isClient}
          briefing={null}
          compliance={null}
          openClientQueries={openClientQueries}
          recentActivity={[]}
          queriesOnly
        />
      )}

      {(isFirmStaff && !isClient) && (
        <div className="mb-4 sm:mb-6">
          <DashboardTodaysTasks
            tasks={taskRows}
            onTaskClick={(task) => {
              if (task.projectId && task.projectId !== 'general') {
                navigate(engagementTasksPath(task.projectId));
              }
            }}
            onBrowseEngagements={() => navigate('/engagements')}
          />
        </div>
      )}

      <DashboardStatsCards stats={statCards} />

      {isFirmLeadership && (
        <AdminPresenceDashboard />
      )}

      <section className="space-y-4" aria-label="Insights and activity">
        <h2 className="text-sm font-medium text-foreground">Insights &amp; activity</h2>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DashboardEngagementsTable
              title={isFirmLeadership ? 'All engagements' : 'My engagements'}
              engagements={engagementRows}
              onRowClick={(row) => navigate(engagementHubPath(row.id, 'workflow'))}
            />
          </div>
          <div>
            <DashboardPerformanceChart
              title="Performance"
              score={performance.score}
              changeLabel={performance.changeLabel}
              data={chartPoints}
            />
          </div>
        </div>

        <DashboardExtraPanels
          isLeadership={false}
          showCompliance={showCompliance}
          isClient={isClient}
          briefing={null}
          compliance={compliance}
          openClientQueries={null}
          recentActivity={data?.recentActivity ?? []}
        />
      </section>
    </AppPageContainer>
  );
}
