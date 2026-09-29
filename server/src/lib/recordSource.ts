/** Record provenance for Client / Engagement (Imports spec). */
export const RECORD_SOURCES = [
  'UNKNOWN',
  'APP',
  'HR_IMPORT',
  'ENGAGEMENT_IMPORT',
  'SYSTEM',
] as const;

export type RecordSource = (typeof RECORD_SOURCES)[number];

/** Case-insensitive, trimmed, collapse internal whitespace — simple client name match key. */
export function normalizeClientNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function displayClientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
