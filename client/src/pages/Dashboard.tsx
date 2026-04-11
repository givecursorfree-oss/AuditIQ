import { useState, useEffect } from 'react';
import {
  Users, Briefcase, AlertTriangle, Clock, TrendingUp, FileText,
  ArrowUpRight, ArrowDownRight, ChevronRight
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { DashboardData, Deadline } from '../types';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS: Record<string, string> = {
  Planning: '#3b82f6',
  Fieldwork: '#f59e0b',
  Review: '#a855f7',
  Completed: '#10b981',
  Archived: '#6b7280',
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [chartData, setChartData] = useState<{ month: string; completed: number; active: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard'),
      api.get('/dashboard/deadlines'),
      api.get('/dashboard/chart-data'),
    ])
      .then(([dashRes, dlRes, chartRes]) => {
        setData(dashRes.data);
        setDeadlines(Array.isArray(dlRes.data) ? dlRes.data : []);
        setChartData(Array.isArray(chartRes.data) ? chartRes.data : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stats = data?.stats;
  const pieData = data?.engagementsByStatus
    ? Object.entries(data.engagementsByStatus).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {user?.firstName}
        </h1>
        <p className="text-sm text-foreground-muted mt-1">
          Here's your audit practice overview for today
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Clients" value={stats?.totalClients ?? 0} color="primary" />
        <StatCard icon={Briefcase} label="Active Engagements" value={stats?.activeEngagements ?? 0} color="success" />
        <StatCard icon={AlertTriangle} label="Overdue Deadlines" value={stats?.overdueDeadlines ?? 0} color="danger" />
        <StatCard icon={Clock} label="Hours This Month" value={stats?.monthlyHours ?? 0} color="warning" suffix="hrs" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar Chart — Engagement Trends */}
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">Engagement Trends (6 months)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap={20}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-foreground-muted)', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-foreground-muted)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--color-foreground)' }}
                />
                <Bar dataKey="active" fill="#0C5CAB" radius={[4, 4, 0, 0]} name="Active" />
                <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart — Status Distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-foreground mb-4">Status Distribution</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[entry.name] }} />
                <span className="text-foreground-muted">{entry.name}</span>
                <span className="text-foreground font-medium">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Engagements + Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Engagements */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Active Engagements</h3>
            <button
              onClick={() => navigate('/engagements')}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
            {data?.activeEngagements?.slice(0, 5)?.map((eng) => (
              <div
                key={eng.id}
                onClick={() => navigate(`/engagements/${eng.id}`)}
                className="flex items-center justify-between p-3 rounded-lg bg-surface hover:bg-hover-bg cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{eng.title}</p>
                  <p className="text-xs text-foreground-muted">{eng.client?.name} • FY {eng.financialYear}</p>
                </div>
                <span className={`badge-${eng.status === 'Fieldwork' ? 'warning' : eng.status === 'Review' ? 'primary' : 'neutral'}`}>
                  {eng.status}
                </span>
              </div>
            ))}
            {(!data?.activeEngagements || data.activeEngagements.length === 0) && (
              <p className="text-sm text-foreground-muted text-center py-4">No active engagements</p>
            )}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="card">
          <h3 className="text-sm font-semibold text-foreground mb-4">Upcoming Deadlines</h3>
          <div className="space-y-2">
            {deadlines.slice(0, 6).map((dl) => (
              <div
                key={dl.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  dl.isOverdue ? 'bg-danger/5 border border-danger/20' : 'bg-surface'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{dl.title}</p>
                  <p className="text-xs text-foreground-muted">
                    {dl.engagement?.client?.name} • {dl.engagement?.title}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className={`text-xs font-medium ${dl.isOverdue ? 'text-danger' : dl.daysRemaining && dl.daysRemaining <= 7 ? 'text-warning' : 'text-foreground-muted'}`}>
                    {dl.isOverdue ? `${Math.abs(dl.daysRemaining || 0)}d overdue` : `${dl.daysRemaining}d left`}
                  </p>
                  <p className="text-[10px] text-foreground-muted">
                    {new Date(dl.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            ))}
            {deadlines.length === 0 && (
              <p className="text-sm text-foreground-muted text-center py-4">No upcoming deadlines</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {data?.recentActivity?.slice(0, 10)?.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0 mt-0.5">
                {activity.user.initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-foreground-secondary">
                  <span className="font-medium text-foreground">{activity.user.firstName} {activity.user.lastName}</span>{' '}
                  {activity.action} {activity.entity}
                </p>
                <p className="text-xs text-foreground-muted">
                  {new Date(activity.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
            </div>
          ))}
          {(!data?.recentActivity || data.recentActivity.length === 0) && (
            <p className="text-sm text-foreground-muted text-center py-4">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card Component ───
function StatCard({ icon: Icon, label, value, color, suffix }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: 'primary' | 'success' | 'danger' | 'warning';
  suffix?: string;
}) {
  const colors = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    danger: 'bg-danger/10 text-danger',
    warning: 'bg-warning/10 text-warning',
  };
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-foreground-muted">{label}</p>
        <p className="text-xl font-bold text-foreground">
          {value.toLocaleString('en-IN')}{suffix && <span className="text-sm font-normal text-foreground-muted ml-1">{suffix}</span>}
        </p>
      </div>
    </div>
  );
}
