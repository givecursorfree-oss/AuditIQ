import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClientPortal } from './ClientPortalContext';

export function ClientPortalInvoicesTab() {
  const { invoices } = useClientPortal();

  return (
    <div className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Invoices & payments</CardTitle>
          <CardDescription>Read-only view — contact your firm for payment instructions</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No invoices on file yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="table-header">
                  <TableHead className="px-4">Invoice</TableHead>
                  <TableHead className="px-4">Engagement</TableHead>
                  <TableHead className="px-4 text-right">Amount</TableHead>
                  <TableHead className="px-4 text-right">Balance</TableHead>
                  <TableHead className="px-4">Due</TableHead>
                  <TableHead className="px-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="px-4 font-data text-sm">{inv.number}</TableCell>
                    <TableCell className="px-4 text-sm">{inv.engagementName ?? '—'}</TableCell>
                    <TableCell className="px-4 text-right tabular-nums">
                      ₹{inv.amount.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums font-medium">
                      ₹{inv.balance.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="px-4 text-sm">
                      {new Date(inv.dueDate).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell className="px-4">
                      <Badge
                        variant={
                          inv.status === 'Paid'
                            ? 'success'
                            : inv.status === 'Overdue'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {inv.status}
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
