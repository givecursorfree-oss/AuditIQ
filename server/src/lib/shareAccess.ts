/** True when the share has no recipient lock, or the viewer email matches it. */
export function shareRecipientMatches(
  restrictedTo: string | null | undefined,
  viewerEmail: string | undefined,
): boolean {
  if (!restrictedTo) return true;
  return !!viewerEmail && viewerEmail.trim().toLowerCase() === restrictedTo.trim().toLowerCase();
}
