/**
 * Ensure Prisma's MySQL pool is sized for a single Node process serving
 * ~50 concurrent staff (SPA + sockets), with headroom under MySQL max_connections.
 *
 * Defaults: connection_limit=25, pool_timeout=20s, connect_timeout=10s.
 * Existing query params are preserved; explicit values win.
 */
export function withPrismaPoolParams(
  databaseUrl: string,
  opts: { connectionLimit?: number; poolTimeout?: number; connectTimeout?: number } = {}
): string {
  const connectionLimit = opts.connectionLimit ?? 25;
  const poolTimeout = opts.poolTimeout ?? 20;
  const connectTimeout = opts.connectTimeout ?? 10;

  const defaults: Record<string, string> = {
    connection_limit: String(connectionLimit),
    pool_timeout: String(poolTimeout),
    connect_timeout: String(connectTimeout),
  };

  try {
    const u = new URL(databaseUrl);
    for (const [key, value] of Object.entries(defaults)) {
      if (!u.searchParams.has(key)) u.searchParams.set(key, value);
    }
    return u.toString();
  } catch {
    // Non-standard URLs (rare) — append only missing keys via string splice.
    const hasQuery = databaseUrl.includes('?');
    const parts: string[] = [];
    for (const [key, value] of Object.entries(defaults)) {
      if (!new RegExp(`[?&]${key}=`).test(databaseUrl)) {
        parts.push(`${key}=${value}`);
      }
    }
    if (parts.length === 0) return databaseUrl;
    return `${databaseUrl}${hasQuery ? '&' : '?'}${parts.join('&')}`;
  }
}
