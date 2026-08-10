import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RequestStatusBadge, LetterWorkflowStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { Briefcase } from '@phosphor-icons/react';
import { serviceRequestNextStep } from './utils';
import type { ServiceRequestRow } from './types';

interface ServiceRequestsPanelProps {
  rows: ServiceRequestRow[];
  loading: boolean;
}

export function ServiceRequestsPanel({ rows, loading }: ServiceRequestsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your service requests</CardTitle>
        <CardDescription>
          Track requests submitted to the firm. After approval, your engagement letter will appear on this
          dashboard for you to review and sign.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {loading ? (
          <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Briefcase size={40} />
            <p>No service requests yet. Use &quot;Request New Engagement&quot; to get started.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="table-header">
                <TableHead className="px-4">Submitted</TableHead>
                <TableHead className="px-4">Services</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Next step</TableHead>
                <TableHead className="px-4">Letter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="px-4 text-sm">
                    {new Date(r.submittedAt).toLocaleDateString('en-IN')}
                  </TableCell>
                  <TableCell className="px-4 text-sm">
                    <p className="font-medium text-foreground">
                      {(r.serviceLabels ?? r.selectedServices ?? []).join(', ') || '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">FY {(r.financialYears ?? []).join(', ')}</p>
                    {r.status === 'rejected' && r.rejectionReason && (
                      <p className="text-xs text-danger mt-1">{r.rejectionReason}</p>
                    )}
                  </TableCell>
                  <TableCell className="px-4">
                    <RequestStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="px-4 text-sm text-foreground-secondary max-w-xs">
                    {serviceRequestNextStep(r)}
                  </TableCell>
                  <TableCell className="px-4">
                    {r.engagement?.letterStatus ? (
                      <LetterWorkflowStatusBadge
                        context={{
                          requestStatus: r.status,
                          letterStatus: r.engagement.letterStatus,
                          hasEngagement: true,
                        }}
                      />
                    ) : (
                      <LetterWorkflowStatusBadge
                        context={{
                          requestStatus: r.status,
                          letterStatus: 'not_required',
                          hasEngagement: false,
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
