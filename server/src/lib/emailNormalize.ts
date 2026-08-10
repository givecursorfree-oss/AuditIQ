/** Canonical email form for storage and lookup (lowercase, trimmed). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
