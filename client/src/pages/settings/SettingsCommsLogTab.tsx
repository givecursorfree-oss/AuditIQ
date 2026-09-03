import { useState, useEffect } from 'react';
import { SpinnerGap as Loader2 } from '@phosphor-icons/react';
import api from '../../services/api';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type CommsLogEntry = {
  id: string;
  toAddress: string;
  subject: string;
  status: string;
  templateKey: string;
  createdAt: string;
  sentAt: string | null;
  errorMessage: string | null;
  client?: { name: string } | null;
  engagement?: { title: string } | null;
  body?: string;
};

export default function SettingsCommsLogTab() {
  const [logs, setLogs] = useState<CommsLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = logs.find((l) => l.id === selectedId);

  useEffect(() => {
    setLoading(true);
    const q = statusFilter ? `?status=${statusFilter}` : '';
    api
      .get(`/comms${q}`)
      .then(({ data }) => setLogs(data))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Communications log</CardTitle>
          <CardDescription>
            All outbound emails (verification links, client notifications, and reminders). Emails are delivered directly through SMTP or recorded as failed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['', 'sent', 'failed'] as const).map((s) => (
              <Button
                key={s || 'all'}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline'}
                onClick={() => setStatusFilter(s)}
              >
                {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          {logs.length === 0 ? (
            <p className="text-sm text-foreground-muted py-8 text-center">No communications logged yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Client / Engagement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow
                      key={log.id}
                      className={`cursor-pointer ${selectedId === log.id ? 'bg-hover-bg' : ''}`}
                      onClick={() => setSelectedId(selectedId === log.id ? null : log.id)}
                    >
                      <TableCell className="text-xs text-foreground-secondary whitespace-nowrap">
                        {new Date(log.sentAt || log.createdAt).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{log.toAddress}</TableCell>
                      <TableCell className="text-sm text-foreground max-w-[200px] truncate">{log.subject}</TableCell>
                      <TableCell className="text-xs text-foreground-muted">{log.templateKey}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.status === 'sent'
                              ? 'default'
                              : log.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-foreground-secondary">
                        {log.client?.name || '—'}
                        {log.engagement?.title ? ` · ${log.engagement.title}` : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {selected && (
            <div className="rounded-lg border border-border bg-surface-muted p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Message body</p>
              <pre className="text-xs text-foreground-secondary whitespace-pre-wrap break-all max-h-48 overflow-y-auto bg-card border border-border rounded-md p-3">
                {selected.body?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '(empty)'}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
