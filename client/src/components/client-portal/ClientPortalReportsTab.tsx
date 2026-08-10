import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useClientPortal } from './ClientPortalContext';

export function ClientPortalReportsTab() {
  const {
    reports,
    reportQueryText,
    setReportQueryText,
    acknowledgeReport,
    raiseReportQuery,
  } = useClientPortal();

  return (
    <div className="mt-4 space-y-4">
      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No reports shared yet.
          </CardContent>
        </Card>
      ) : (
        reports.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="text-base">{r.title}</CardTitle>
              <CardDescription>
                {r.engagementName} · {r.type}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">{r.status}</Badge>
                {r.acknowledgedAt && <Badge variant="success">Acknowledged</Badge>}
              </div>
              {!r.acknowledgedAt && (
                <Button size="sm" variant="outline" onClick={() => void acknowledgeReport(r.id)}>
                  Acknowledge receipt
                </Button>
              )}
              {!r.clientQuery && (
                <div className="flex gap-2">
                  <input
                    className="input-field flex-1"
                    aria-label="Questions on this report"
                    placeholder="Questions on this report…"
                    value={reportQueryText[r.id] ?? ''}
                    onChange={(e) => setReportQueryText((p) => ({ ...p, [r.id]: e.target.value }))}
                  />
                  <Button size="sm" onClick={() => void raiseReportQuery(r.id)}>
                    Raise query
                  </Button>
                </div>
              )}
              {r.clientQuery && (
                <p className="text-xs text-muted-foreground">Query submitted: {r.clientQuery}</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
