/** Staff claim types and validation (Food + Travel V1). */

export const CLAIM_TYPES = ['food', 'travel'] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const PAYMENT_MODES = ['bank_transfer', 'cash', 'payroll_adjustment'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const CLAIM_STATUSES = ['pending_approval', 'approved', 'partially_approved', 'rejected'] as const;
export const PROCESSING_STATUSES = ['unprocessed', 'in_batch', 'partner_approved', 'accounts_approved', 'paid'] as const;

export function isValidClaimType(t: string): t is ClaimType {
  return (CLAIM_TYPES as readonly string[]).includes(t);
}

export function isValidPaymentMode(mode: string): mode is PaymentMode {
  return (PAYMENT_MODES as readonly string[]).includes(mode);
}

export function validateAmount(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return 'Amount must be greater than zero';
  return null;
}

export function validatePartialAmount(claimed: number, approved: number): string | null {
  if (!Number.isFinite(approved) || approved <= 0) return 'Approved amount must be greater than zero';
  if (approved > claimed) return 'Approved amount cannot exceed claimed amount';
  return null;
}
