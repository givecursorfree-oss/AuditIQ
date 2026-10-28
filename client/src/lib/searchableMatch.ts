/** Lowercase and turn non-alphanumerics into single spaces. */
export function foldSearchText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * True when every query token appears somewhere in the label
 * (substring, order-independent). "Geo" matches "L&T GeoStructure Private Limited";
 * "LT Geo" also matches after stripping punctuation.
 */
export function searchableMatch(haystack: string, query: string): boolean {
  const q = foldSearchText(query);
  if (!q) return true;
  const hay = foldSearchText(haystack);
  const hayCompact = hay.replace(/ /g, '');
  return q.split(' ').every((token) => hay.includes(token) || hayCompact.includes(token));
}
