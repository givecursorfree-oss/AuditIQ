/** Pick only allowed keys; convert empty strings to undefined for optional API fields. */
export function pickFormPayload<T extends Record<string, unknown>>(
  source: T,
  keys: (keyof T)[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const val = source[key];
    if (val === '' || val === null) continue;
    if (val !== undefined) out[String(key)] = val;
  }
  return out;
}

export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const ax = err as {
    response?: {
      data?: {
        error?: string;
        details?: Array<{ path?: (string | number)[]; message?: string }>;
      };
    };
  };
  const data = ax.response?.data;
  if (data?.details?.length) {
    return data.details.map((d) => d.message || 'Invalid field').join('; ');
  }
  if (data?.error) return data.error;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
