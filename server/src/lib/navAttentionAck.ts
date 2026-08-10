import prisma from './prisma.js';

export type NavAttentionScope =
  | 'dashboard'
  | 'requests'
  | 'workflow'
  | 'clients'
  | 'documents'
  | 'queries'
  | 'letters'
  | 'notifications'
  | 'client-portal';

const EPOCH = new Date(0);

export async function getNavAckMap(userId: string): Promise<Partial<Record<NavAttentionScope, Date>>> {
  const rows = await prisma.navAttentionAck.findMany({
    where: { userId },
    select: { scope: true, ackedAt: true },
  });
  const map: Partial<Record<NavAttentionScope, Date>> = {};
  for (const row of rows) {
    map[row.scope as NavAttentionScope] = row.ackedAt;
  }
  return map;
}

export function ackSince(
  map: Partial<Record<NavAttentionScope, Date>>,
  scope: NavAttentionScope
): Date {
  return map[scope] ?? EPOCH;
}

export async function ackNavAttentionScopes(
  userId: string,
  scopes: NavAttentionScope[]
): Promise<void> {
  if (scopes.length === 0) return;
  const now = new Date();
  await prisma.$transaction(
    scopes.map((scope) =>
      prisma.navAttentionAck.upsert({
        where: { userId_scope: { userId, scope } },
        create: { userId, scope, ackedAt: now },
        update: { ackedAt: now },
      })
    )
  );
}

/** Mark in-app notifications read when the user has opened the related nav area. */
export async function markNotificationsReadForNavScopes(
  userId: string,
  scopes: NavAttentionScope[]
): Promise<void> {
  if (scopes.includes('notifications')) {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  const linkPrefixes: string[] = [];
  for (const scope of scopes) {
    if (scope === 'notifications') continue;
    switch (scope) {
      case 'requests':
        linkPrefixes.push('/requests');
        break;
      case 'workflow':
        linkPrefixes.push('/engagements/workflow', '/workflow', '/engagements/');
        break;
      case 'clients':
        linkPrefixes.push('/clients');
        break;
      case 'documents':
        linkPrefixes.push('/documents');
        break;
      case 'queries':
        linkPrefixes.push('tab=queries');
        break;
      case 'letters':
        linkPrefixes.push('/letter');
        break;
      case 'client-portal':
        linkPrefixes.push('/client/dashboard');
        break;
      default:
        break;
    }
  }

  if (linkPrefixes.length === 0) return;

  const unread = await prisma.notification.findMany({
    where: { userId, isRead: false, link: { not: null } },
    select: { id: true, link: true },
  });
  const ids = unread
    .filter((n) => n.link && linkPrefixes.some((p) => n.link!.includes(p)))
    .map((n) => n.id);
  if (ids.length === 0) return;
  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId },
    data: { isRead: true },
  });
}

export async function ackNavAttention(
  userId: string,
  scopes: NavAttentionScope[],
  options?: { markNotificationsRead?: boolean }
): Promise<void> {
  await ackNavAttentionScopes(userId, scopes);
  if (options?.markNotificationsRead !== false) {
    await markNotificationsReadForNavScopes(userId, scopes);
  }
}
