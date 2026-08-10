export const AUDITIQ_USER_STORAGE_KEY = 'auditiq_user:v1';

export function readStoredUser(): Record<string, unknown> | null {
  const raw =
    localStorage.getItem(AUDITIQ_USER_STORAGE_KEY) ?? localStorage.getItem('auditiq_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function writeStoredUser(data: Record<string, unknown>): void {
  localStorage.setItem(AUDITIQ_USER_STORAGE_KEY, JSON.stringify(data));
  localStorage.removeItem('auditiq_user');
}

export function clearStoredUser(): void {
  localStorage.removeItem(AUDITIQ_USER_STORAGE_KEY);
  localStorage.removeItem('auditiq_user');
}
