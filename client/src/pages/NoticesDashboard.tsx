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

  useEffect(() => {
    void Promise.all([
      api.get<Dashboard>('/notices/dashboard'),
      api.get<typeof notices>('/notices'),
    ]).then(([d, n]) => {
      setDash(d.data);
      setNotices(n.data.slice(0, 20));
    });
  }, []);

  return (
    <AppPageContainer>
      <PageHeader title="Notice dashboard" description="Government portal notices by due date" />

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
            {!dash.integration.configured && (
              <p className="mt-2 text-xs text-muted-foreground">
                Set <code className="rounded bg-muted px-1">PORTAL_SYNC_PROVIDER=playwright</code> on the server and add
                credentials in the vault. Manual notice entry still works.
              </p>
            )}
          </div>
        </div>
      )}

      {dash && (
        <PanelCard title="Summary" className="mb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="py-2 text-left">
                    Portal
                  </th>
                  <th className="py-2">Overdue</th>
                  <th className="py-2">Due 7 days</th>
                  <th className="py-2">Due 30 days</th>
                </tr>
              </thead>
              <tbody>
                {NOTICE_PORTALS.map((p) => (
                  <tr key={p} className="border-b border-border/50">
                    <td className="py-2 font-medium">{p.replace('_', ' ')}</td>
                    <td className="py-2 text-center">{dash.matrix[p]?.overdue ?? 0}</td>
                    <td className="py-2 text-center">{dash.matrix[p]?.due7 ?? 0}</td>
                    <td className="py-2 text-center">{dash.matrix[p]?.due30 ?? 0}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">TOTAL</td>
                  <td className="py-2 text-center">{dash.total.overdue}</td>
                  <td className="py-2 text-center">{dash.total.due7}</td>
                  <td className="py-2 text-center">{dash.total.due30}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </PanelCard>
      )}
      <PanelCard title="Recent notices">
        {notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notices. Sync from client vault credentials or add manually.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {notices.map((n) => (
              <li key={n.id} className="flex justify-between gap-2 border-b py-2">
                <Link to={`/notices/${n.id}`} className="text-primary hover:underline">
                  {n.subject}
                </Link>
                <span className="text-muted-foreground shrink-0">{n.portal}</span>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link to="/vault">Portal credentials</Link>
        </Button>
      </PanelCard>
    </AppPageContainer>
  );
}
