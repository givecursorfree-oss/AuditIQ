import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { WarningCircle as AlertCircle, PlugsConnected as Plug } from '@phosphor-icons/react';
import api from '../services/api';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { PanelCard } from '../components/layout/PanelCard';
import PageHeader from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

const NOTICE_PORTALS = ['GST', 'Income_Tax', 'TRACES'] as const;

interface Dashboard {
  matrix: Record<string, { overdue: number; due7: number; due30: number }>;
  total: { overdue: number; due7: number; due30: number };
  byLevel: Record<string, Record<string, number>>;
  integration?: { provider: string; configured: boolean; message?: string };
}

export default function NoticesDashboard() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [notices, setNotices] = useState<{ id: string; subject: string; portal: string; dueDate?: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get<Dashboard>('/notices/dashboard'),
      api.get<typeof notices>('/notices'),
    ]).then(([d, n]) => {
      setDash(d.data);
      setNotices(n.data.slice(0, 20));
      setLoadError(null);
    }).catch(() => {
      setLoadError('Failed to load.');
    });
  }, []);

  return (
    <AppPageContainer>
      <PageHeader title="Notice dashboard" description="Government portal notices by due date" />

      {loadError && <p className="text-sm text-destructive mb-4">{loadError}</p>}

      {dash?.integration && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-lg border p-4 text-sm ${
            dash.integration.configured
              ? 'border-emerald-500/30 bg-emerald-500/10 text-foreground'
              : 'border-amber-500/30 bg-amber-500/10 text-foreground'
          }`}
          role="status"
        >
          {dash.integration.configured ? (
            <Plug size={20} className="shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <AlertCircle size={20} className="shrink-0 text-amber-600" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              Portal sync:{' '}
              <Badge variant="outline" className="ml-1">
                {dash.integration.provider}
              </Badge>
              {dash.integration.configured ? ' — configured' : ' — not configured'}
            </p>
            {dash.integration.message && (
              <p className="mt-1 text-muted-foreground">{dash.integration.message}</p>
            )}
          </div>
        </div>
      )}

      {dash && (
        <>
          <PanelCard title="Summary by due date" className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="py-2 text-left">Portal</th>
                    <th scope="col" className="py-2 text-right">Overdue</th>
                    <th scope="col" className="py-2 text-right">Due 7d</th>
                    <th scope="col" className="py-2 text-right">Due 30d</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTICE_PORTALS.map((p) => (
                    <tr key={p} className="border-b border-border/50">
                      <td className="py-2">{p.replace('_', ' ')}</td>
                      <td className="py-2 text-right font-medium text-destructive">
                        {dash.matrix[p]?.overdue ?? 0}
                      </td>
                      <td className="py-2 text-right">{dash.matrix[p]?.due7 ?? 0}</td>
                      <td className="py-2 text-right">{dash.matrix[p]?.due30 ?? 0}</td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right">{dash.total.overdue}</td>
                    <td className="py-2 text-right">{dash.total.due7}</td>
                    <td className="py-2 text-right">{dash.total.due30}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </PanelCard>

          <PanelCard title="By adjudication level" className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="py-2 text-left">Portal</th>
                    <th scope="col" className="py-2 text-left">Level</th>
                    <th scope="col" className="py-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTICE_PORTALS.flatMap((portal) => {
                    const levels = dash.byLevel[portal] ?? {};
                    const entries = Object.entries(levels);
                    if (entries.length === 0) {
                      return (
                        <tr key={portal} className="border-b border-border/50">
                          <td className="py-2">{portal.replace('_', ' ')}</td>
                          <td className="py-2 text-muted-foreground" colSpan={2}>—</td>
                        </tr>
                      );
                    }
                    return entries.map(([level, count]) => (
                      <tr key={`${portal}-${level}`} className="border-b border-border/50">
                        <td className="py-2">{portal.replace('_', ' ')}</td>
                        <td className="py-2">{level}</td>
                        <td className="py-2 text-right">{count}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </>
      )}

      <PanelCard title="Recent notices">
        {notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notices yet. Sync from client vault or add manually.</p>
        ) : (
          <ul className="divide-y text-sm">
            {notices.map((n) => (
              <li key={n.id} className="py-2 flex justify-between gap-2">
                <span className="truncate">{n.subject}</span>
                <Button asChild variant="link" size="sm" className="shrink-0">
                  <Link to={`/notices/${n.id}`}>View</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </AppPageContainer>
  );
}
