import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    engagement: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    engagementMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    task: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    workpaper: { findUnique: vi.fn() },
    report: { findUnique: vi.fn() },
    form3CDClause: { findUnique: vi.fn() },
  },
}));

vi.mock('../prisma.js', () => ({ default: mockPrisma }));

import {
  canAccessEngagement,
  engagementIdsFilter,
} from '../engagementAccess.js';

describe('canAccessEngagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  it('allows Senior Audit Manager firm-wide via hierarchy', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({ firmId: 'firm-a' });
    const ok = await canAccessEngagement('u1', 'Manager', 'firm-a', 'eng-1', 'SENIOR_AUDIT_MANAGER');
    expect(ok).toBe(true);
  });

  it('denies Audit Manager without assignment', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({
      firmId: 'firm-a',
      partnerInChargeId: null,
      managerId: 'other',
      articleAssistantId: null,
      currentStage: 'Filing',
      filedAt: null,
      archivedAt: null,
    });
    mockPrisma.engagementMember.findFirst.mockResolvedValue(null);
    mockPrisma.task.findFirst.mockResolvedValue(null);
    const ok = await canAccessEngagement('u-am', 'Manager', 'firm-a', 'eng-1', 'AUDIT_MANAGER');
    expect(ok).toBe(false);
  });

  it('denies when engagement does not exist', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue(null);
    const ok = await canAccessEngagement('u1', 'Staff', 'firm-a', 'eng-1');
    expect(ok).toBe(false);
  });

  it('denies when user firm does not match engagement firm', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({ firmId: 'firm-b' });
    const ok = await canAccessEngagement('u1', 'Staff', 'firm-a', 'eng-1');
    expect(ok).toBe(false);
  });

  it('allows Partner for any engagement in their firm', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({ firmId: 'firm-a' });
    const ok = await canAccessEngagement('u1', 'Partner', 'firm-a', 'eng-1');
    expect(ok).toBe(true);
    expect(mockPrisma.engagementMember.findFirst).not.toHaveBeenCalled();
  });

  it('allows Staff only when they are engagement members', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({ firmId: 'firm-a' });
    mockPrisma.engagementMember.findFirst.mockResolvedValue({ id: 'mem-1' });
    const ok = await canAccessEngagement('u1', 'Staff', 'firm-a', 'eng-1');
    expect(ok).toBe(true);
  });

  it('denies Staff without membership or assigned task', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({ firmId: 'firm-a' });
    mockPrisma.engagementMember.findFirst.mockResolvedValue(null);
    mockPrisma.task.findFirst.mockResolvedValue(null);
    const ok = await canAccessEngagement('u1', 'Staff', 'firm-a', 'eng-1');
    expect(ok).toBe(false);
  });

  it('allows Staff when they have an assigned task on the engagement', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({ firmId: 'firm-a' });
    mockPrisma.engagementMember.findFirst.mockResolvedValue(null);
    mockPrisma.task.findFirst.mockResolvedValue({ id: 'task-1' });
    const ok = await canAccessEngagement('u1', 'Staff', 'firm-a', 'eng-1');
    expect(ok).toBe(true);
  });

  it('allows Staff who created a task but is not on the engagement team', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({ firmId: 'firm-a' });
    mockPrisma.engagementMember.findFirst.mockResolvedValue(null);
    mockPrisma.task.findFirst.mockResolvedValue({ id: 'task-2' });
    const ok = await canAccessEngagement('staff-mgr', 'Staff', 'firm-a', 'eng-1');
    expect(ok).toBe(true);
    expect(mockPrisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          engagementId: 'eng-1',
          OR: [{ assigneeId: 'staff-mgr' }, { createdById: 'staff-mgr' }],
        }),
      })
    );
  });
});

describe('engagementIdsFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  it('returns empty filter when user has no firm', async () => {
    const filter = await engagementIdsFilter('u1', 'Staff', null);
    expect(filter).toEqual({ engagementId: { in: [] } });
  });

  it('returns all firm engagements for Partner', async () => {
    mockPrisma.engagement.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    const filter = await engagementIdsFilter('u1', 'Partner', 'firm-a');
    expect(filter).toEqual({ engagementId: { in: ['e1', 'e2'] } });
  });

  it('returns member and task-assigned engagements for Staff', async () => {
    mockPrisma.engagement.findMany.mockResolvedValue([{ id: 'e3' }, { id: 'e4' }]);
    const filter = await engagementIdsFilter('u1', 'Staff', 'firm-a', 'AUDIT_EXECUTIVE');
    expect(filter).toEqual({ engagementId: { in: ['e3', 'e4'] } });
  });
});
