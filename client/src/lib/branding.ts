/** Official AuditIQ wordmarks — light UI / dark UI */
export const LOGO_LIGHT_URL = '/logo-light.png';
export const LOGO_DARK_URL = '/logo-dark.png';

/**
 * Resolve a user's avatar URL. Returns undefined when the user has no custom
 * avatar so callers render an initials fallback instead of requesting a
 * non-existent placeholder image.
 */
export function resolveAvatarUrl(avatar?: string | null): string | undefined {
  const trimmed = avatar?.trim();
  return trimmed || undefined;
}
