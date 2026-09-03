import { DotmSquare3 } from '@/components/ui/dotm-square-3';
import {
  OCR_STATUS_LABELS,
  claimPolicyFlagLines,
  formatInr,
  ocrAmountMismatch,
  type StaffClaimRow,
} from '@/lib/expenseClaims';

export function ClaimValidationPanel({ claim }: { claim: StaffClaimRow }) {
  const policyLines = claimPolicyFlagLines(claim.policyFlags);
  const ocrStatus = claim.ocrStatus ?? 'pending';
  const ocrAmount = claim.ocrDetectedAmount;
  const mismatch = ocrAmountMismatch(claim.amount, ocrAmount);
  const ocrPending = ocrStatus === 'pending';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Validation</p>
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
          {ocrPending ? <DotmSquare3 size={12} dotSize={2} aria-label="OCR scanning" /> : null}
          {OCR_STATUS_LABELS[ocrStatus] ?? ocrStatus}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
        <div className="bg-card px-2.5 py-2">
          <dt className="text-muted-foreground">Claimed</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{formatInr(claim.amount)}</dd>
        </div>
        <div className="bg-card px-2.5 py-2">
          <dt className="text-muted-foreground">OCR</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {ocrAmount != null ? (
              formatInr(ocrAmount)
            ) : ocrPending ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground font-normal">
                <DotmSquare3 size={12} dotSize={2} aria-label="Reading receipt" />
                …
              </span>
            ) : (
              <span className="text-warning font-normal">—</span>
            )}
          </dd>
        </div>
        <div className="bg-card px-2.5 py-2">
          <dt className="text-muted-foreground">Match</dt>
          <dd className="mt-0.5 font-medium">
            {ocrAmount == null ? (
              <span className="text-muted-foreground">—</span>
            ) : mismatch ? (
              <span className="text-warning">No</span>
            ) : (
              <span className="text-success">Yes</span>
            )}
          </dd>
        </div>
      </dl>

      {policyLines.length > 0 && (
        <ul className="space-y-1 border-l-2 border-warning/60 pl-2.5 text-[11px] text-foreground">
          {policyLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
