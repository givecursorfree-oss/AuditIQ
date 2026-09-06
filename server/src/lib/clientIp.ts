import type { Request } from 'express';

/** Strip IPv4-mapped IPv6 prefix (`::ffff:127.0.0.1` → `127.0.0.1`). */
function normalizeIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

/** Real client IP behind reverse proxies (X-Forwarded-For first hop). */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return normalizeIp(forwarded.split(',')[0]);
  if (Array.isArray(forwarded) && forwarded[0]) return normalizeIp(String(forwarded[0]).split(',')[0]);
  return normalizeIp(req.socket.remoteAddress ?? undefined);
}
