/** Allow only same-origin in-app paths (blocks open redirects and script URLs). */
export function safeInAppPath(link: string | null | undefined): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;

  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
