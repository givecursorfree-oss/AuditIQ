import { Badge } from '@/components/ui/badge';
import {
  CLAIM_TYPE_LABELS,
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
        {new Date(claim.expenseDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </p>
      <ClaimProgressStepper claim={claim} />
    </header>
  );
}
