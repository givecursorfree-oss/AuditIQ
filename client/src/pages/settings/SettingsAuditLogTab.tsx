import { useState, useEffect } from 'react';
import { SpinnerGap as Loader2 } from '@phosphor-icons/react';
import api from '../../services/api';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type AuditLogEntry = {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  details: string | null;
  user?: { firstName: string; lastName: string } | null;
};

export default function SettingsAuditLogTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoadError(false);
    api.get(`/admin/audit-logs?page=${page}&limit=25`)
      .then(({ data }) => {
        setLogs(data.logs);
        setTotalPages(data.totalPages);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (loadError) {
    return <p className="py-12 text-center text-sm text-foreground-muted">Failed to load the audit log. Please try again.</p>;
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-foreground-muted text-xs">
                  {new Date(log.createdAt).toLocaleString('en-IN')}
                </TableCell>
                <TableCell>
                  {log.user ? (
                    <span className="text-foreground">{log.user.firstName} {log.user.lastName}</span>
                  ) : (
                    <span className="text-foreground-muted">System</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{log.action}</Badge>
                </TableCell>
                <TableCell className="text-foreground-muted">{log.entity}</TableCell>
                <TableCell className="text-foreground-muted text-xs max-w-xs truncate">{log.details || '—'}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-foreground-muted py-8">No audit logs found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="px-3 py-1.5 text-sm text-foreground-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
