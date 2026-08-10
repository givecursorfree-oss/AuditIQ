import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    engagement: { findMany: vi.fn(), findUnique: vi.fn() },
    engagementMember: { findFirst: vi.fn(), findMany: vi.fn() },
    task: { findFirst: vi.fn() },
  },
}));

vi.mock('../prisma.js', () => ({ default: mockPrisma }));

import { canAccessDocument, canMutateDocument, clientPortalDocumentWhere } from '../documentAccess.js';

describe('canAccessDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.task.findFirst.mockResolvedValue(null);
  });

  const baseDoc = {
    firmId: 'firm-a',
    visibility: 'ENGAGEMENT',
    engagementId: 'eng-1',
    uploadedById: 'uploader',
  };

  it('allows the uploader always', async () => {
    const ok = await canAccessDocument('uploader', 'Staff', 'firm-a', baseDoc);
    expect(ok).toBe(true);
  });

  it('allows firm-public documents to any firm user', async () => {
    const ok = await canAccessDocument('u2', 'Staff', 'firm-a', {
      ...baseDoc,
      visibility: 'FIRM',
    });
    expect(ok).toBe(true);
  });

  it('denies cross-firm access', async () => {
    const ok = await canAccessDocument('u2', 'Staff', 'firm-b', baseDoc);
    expect(ok).toBe(false);
  });

  it('allows Partner without membership check', async () => {
    const ok = await canAccessDocument('u2', 'Partner', 'firm-a', baseDoc);
    expect(ok).toBe(true);
    expect(mockPrisma.engagement.findUnique).not.toHaveBeenCalled();
  });

  it('allows Staff with engagement membership', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({
      firmId: 'firm-a',
      partnerInChargeId: null,
      managerId: null,
      articleAssistantId: null,
    });
    mockPrisma.engagementMember.findFirst.mockResolvedValue({ id: 'm1' });
    const ok = await canAccessDocument('u2', 'Staff', 'firm-a', baseDoc);
    expect(ok).toBe(true);
  });

  it('allows manager assigned to engagement without membership row', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({
      firmId: 'firm-a',
      partnerInChargeId: null,
      managerId: 'u2',
      articleAssistantId: null,
    });
    const ok = await canAccessDocument('u2', 'Staff', 'firm-a', baseDoc);
    expect(ok).toBe(true);
    expect(mockPrisma.engagementMember.findFirst).not.toHaveBeenCalled();
  });

  it('denies Staff without any engagement access on private docs', async () => {
    mockPrisma.engagement.findUnique.mockResolvedValue({
      firmId: 'firm-a',
      partnerInChargeId: null,
      managerId: null,
      articleAssistantId: null,
    });
    mockPrisma.engagementMember.findFirst.mockResolvedValue(null);
    const ok = await canAccessDocument('u2', 'Staff', 'firm-a', baseDoc);
    expect(ok).toBe(false);
  });
});

describe('clientPortalDocumentWhere', () => {
  it('scopes to the client and only Client Upload / client-authored files', () => {
    expect(clientPortalDocumentWhere('c1', 'e1')).toEqual({
      engagement: { clientId: 'c1', id: 'e1' },
      OR: [{ folder: 'Client Upload' }, { uploadedBy: { role: 'Client' } }],
    });
  });
});

describe('canMutateDocument', () => {
  it('allows the uploader or Partner/Admin only', () => {
    expect(canMutateDocument('u1', 'Staff', { uploadedById: 'u1' })).toBe(true);
    expect(canMutateDocument('u2', 'Staff', { uploadedById: 'u1' })).toBe(false);
    expect(canMutateDocument('u2', 'Partner', { uploadedById: 'u1' })).toBe(true);
  });
});
