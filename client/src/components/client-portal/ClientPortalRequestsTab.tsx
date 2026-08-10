import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChatCircle as MessageSquare } from '@phosphor-icons/react';
import { useClientPortal } from './ClientPortalContext';
import { ServiceRequestsPanel } from './ServiceRequestsPanel';

export function ClientPortalRequestsTab() {
  const { serviceRequests, serviceRequestsLoading, docRequests } = useClientPortal();
  const [todayKey, setTodayKey] = useState('');

  useEffect(() => {
    setTodayKey(new Date().toISOString().slice(0, 10));
  }, []);

  return (
    <div className="mt-4 space-y-4">
      <ServiceRequestsPanel rows={serviceRequests} loading={serviceRequestsLoading} />
      <Card>
        <CardHeader>
          <CardTitle>Document requests from your audit team</CardTitle>
          <CardDescription>Requests linked to your engagements only</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {docRequests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <MessageSquare size={40} />
              <p>No document requests at this time.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="table-header">
                  <TableHead className="px-4">Request</TableHead>
                  <TableHead className="px-4">Engagement</TableHead>
                  <TableHead className="px-4">Due</TableHead>
                  <TableHead className="px-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docRequests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="px-4">
                      <p className="font-medium text-foreground">{r.title}</p>
                      {r.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="px-4 text-sm text-foreground-secondary">
                      {r.engagementName}
                    </TableCell>
                    <TableCell className="px-4 text-sm">
                      {r.dueDate ? (
                        <span
                          className={
                            todayKey && r.dueDate.slice(0, 10) < todayKey && r.status === 'Pending'
                              ? 'text-danger font-medium'
                              : ''
                          }
                        >
                          {new Date(r.dueDate).toLocaleDateString('en-IN')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="px-4">
                      <Badge
                        variant={
                          r.status === 'Received'
                            ? 'success'
                            : r.status === 'Overdue' || r.status === 'Rejected'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
