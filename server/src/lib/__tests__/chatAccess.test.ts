import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canStaffChatWithUser,
  clientCanAccessRoom,
} from '../chatAccess.js';

vi.mock('../prisma.js', () => ({
  default: {
    user: { findFirst: vi.fn() },
    engagement: { findMany: vi.fn() },
    clientPortalUser: { findFirst: vi.fn() },
  },
}));

vi.mock('../clientScope.js', () => ({
  resolveClientIdForPortalUser: vi.fn(),
}));

vi.mock('../engagementAccess.js', () => ({
  listAccessibleEngagementIds: vi.fn(),
}));

import prisma from '../prisma.js';
import { resolveClientIdForPortalUser } from '../clientScope.js';
import { listAccessibleEngagementIds } from '../engagementAccess.js';

describe('chatAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clientCanAccessRoom denies direct messages', async () => {
    vi.mocked(resolveClientIdForPortalUser).mockResolvedValue({ clientId: 'c1', clientName: 'Co' });
    vi.mocked(prisma.engagement.findMany).mockResolvedValue([{ id: 'e1' }] as never);

    const ok = await clientCanAccessRoom('u1', 'a@b.com', 'f1', {
      engagementId: 'e1',
      type: 'direct',
    });
    expect(ok).toBe(false);
  });

  it('canStaffChatWithUser allows staff-to-staff', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'u2',
      role: 'Staff',
    } as never);

    const ok = await canStaffChatWithUser('u1', 'Manager', 'f1', 'u2');
    expect(ok).toBe(true);
  });

  it('canStaffChatWithUser allows Admin to message any client', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'c1',
      role: 'Client',
    } as never);

    const ok = await canStaffChatWithUser('u1', 'Admin', 'f1', 'c1');
    expect(ok).toBe(true);
    expect(listAccessibleEngagementIds).not.toHaveBeenCalled();
  });

  it('canStaffChatWithUser requires shared engagement for Manager → Client', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'c1',
      role: 'Client',
    } as never);
    vi.mocked(listAccessibleEngagementIds).mockResolvedValue(['e1']);
    vi.mocked(prisma.clientPortalUser.findFirst).mockResolvedValue({ id: 'p1' } as never);

    const ok = await canStaffChatWithUser('u1', 'Manager', 'f1', 'c1');
    expect(ok).toBe(true);
  });
});
