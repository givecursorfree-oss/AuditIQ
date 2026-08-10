import { describe, expect, it, vi, beforeEach } from 'vitest';

const { upsert, findMany, updateMany } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  default: {
    navAttentionAck: { findMany, upsert },
    notification: { findMany, updateMany },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

import { ackNavAttention, getNavAckMap, markNotificationsReadForNavScopes } from '../navAttentionAck.js';

describe('navAttentionAck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    upsert.mockResolvedValue({});
  });

  it('returns ack timestamps keyed by scope', async () => {
    const t = new Date('2026-06-14T12:00:00Z');
    findMany.mockResolvedValue([{ scope: 'requests', ackedAt: t }]);
    const map = await getNavAckMap('user-1');
    expect(map.requests).toEqual(t);
  });

  it('upserts scopes on ack', async () => {
    await ackNavAttention('user-1', ['requests', 'dashboard'], { markNotificationsRead: false });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('dashboard ack alone does not mark request notifications read', async () => {
    findMany.mockResolvedValue([
      { id: 'n1', link: '/requests/abc' },
      { id: 'n2', link: '/clients?tab=incoming' },
    ]);
    await markNotificationsReadForNavScopes('user-1', ['dashboard']);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('requests ack marks matching notification links read', async () => {
    findMany.mockResolvedValue([
      { id: 'n1', link: '/requests/abc' },
      { id: 'n2', link: '/clients' },
    ]);
    await markNotificationsReadForNavScopes('user-1', ['requests']);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1'] }, userId: 'user-1' },
      data: { isRead: true },
    });
  });
});
