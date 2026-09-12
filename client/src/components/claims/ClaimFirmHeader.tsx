import { Badge } from '@/components/ui/badge';
import {
  CLAIM_TYPE_LABELS,
  TRAVEL_MODE_LABELS,
  engagementCode,
  engagementHeaderLine,
  formatInr,
  staffName,
  type StaffClaimRow,
} from '@/lib/expenseClaims';
import { ClaimProgressStepper } from './ClaimProgressStepper';

export function ClaimFirmHeader({ claim }: { claim: StaffClaimRow }) {
  const eng = claim.engagement ?? claim.participants?.[0]?.engagement;
  const code = engagementCode(eng);
  const dateLabel = new Date(claim.expenseDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const when = claim.travelTime ? `${dateLabel} ${claim.travelTime}` : dateLabel;

  return (
    <header className="space-y-3 border-b border-border pb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {CLAIM_TYPE_LABELS[claim.claimType]} · {formatInr(claim.amount)}
          </h3>
          <p className="text-xs text-muted-foreground truncate">{engagementHeaderLine(claim)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
            {code}
          </Badge>
          {eng?.financialYear ? (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              FY {eng.financialYear}
            </Badge>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {staffName(claim.staff)}
        {claim.expensePayer ? ` · Paid by ${staffName(claim.expensePayer)}` : ''}
        {' · '}
        {when}
      </p>
      {claim.claimType === 'travel' && (
        <dl className="grid gap-1 text-[11px] sm:grid-cols-2">
          {claim.visitedBy && (
            <div>
              <dt className="text-muted-foreground">Visited by</dt>
              <dd>{staffName(claim.visitedBy)}</dd>
            </div>
          )}
          {claim.travelMode && (
            <div>
              <dt className="text-muted-foreground">Mode</dt>
              <dd>{TRAVEL_MODE_LABELS[claim.travelMode] ?? claim.travelMode}</dd>
            </div>
          )}
          {claim.jurisdiction && (
            <div>
              <dt className="text-muted-foreground">Jurisdiction</dt>
              <dd>{claim.jurisdiction}</dd>
            </div>
          )}
          {claim.location && (
            <div>
              <dt className="text-muted-foreground">Location</dt>
              <dd>{claim.location}</dd>
            </div>
          )}
          {claim.centreState && (
            <div>
              <dt className="text-muted-foreground">Centre / State</dt>
              <dd>{claim.centreState}</dd>
            </div>
          )}
          {claim.period && (
            <div>
              <dt className="text-muted-foreground">Period</dt>
              <dd>{claim.period}</dd>
            </div>
          )}
          {claim.issue && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Issue</dt>
              <dd className="whitespace-pre-wrap">{claim.issue}</dd>
            </div>
          )}
          {claim.replyFromDepartment && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Reply from Department</dt>
              <dd className="whitespace-pre-wrap">{claim.replyFromDepartment}</dd>
            </div>
          )}
          {claim.mapLink && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Map</dt>
              <dd>
                <a href={claim.mapLink} target="_blank" rel="noreferrer" className="underline break-all">
                  {claim.mapLink}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
      <ClaimProgressStepper claim={claim} />
    </header>
  );
}
