import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  notifyFirmPartners,
  markClientPortalNotificationsRead,
  markSigned,
  updateLetterStatus,
  updateManyByClientRequestId,
  updateEngagementLetterArtifacts,
  prismaEngagementLetterFindFirst,
} = vi.hoisted(() => ({
  notifyFirmPartners: vi.fn().mockResolvedValue(undefined),
  markClientPortalNotificationsRead: vi.fn().mockResolvedValue(undefined),
  markSigned: vi.fn().mockResolvedValue({ id: 'letter-1', status: 'signed' }),
  updateLetterStatus: vi.fn().mockResolvedValue(undefined),
  updateManyByClientRequestId: vi.fn().mockResolvedValue(undefined),
  updateEngagementLetterArtifacts: vi.fn().mockResolvedValue(undefined),
  prismaEngagementLetterFindFirst: vi.fn(),
}));

vi.mock('../../lib/mkdEngagementLetterDocx.js', () => ({
  renderMkdEngagementLetterDocx: vi.fn().mockResolvedValue('/tmp/signed.docx'),
  resolveEngagementLetterDocxPath: vi.fn(),
}));

vi.mock('../../lib/folderProvisioner.js', () => ({
  provisionClientFolders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/clientScope.js', () => ({
  markClientPortalNotificationsRead,
  notifyClientPortalUsers: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  default: {
    engagementLetter: {
      findFirst: prismaEngagementLetterFindFirst,
    },
    notification: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

import { acceptEngagementLetterByClient } from '../engagementLetterWorkflow.js';
import type { MkdWorkflowDeps } from '../../repositories/index.js';

describe('acceptEngagementLetterByClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies firm partners when the client signs', async () => {
    prismaEngagementLetterFindFirst.mockResolvedValue({
      id: 'letter-1',
      clientId: 'client-1',
      engagementId: 'eng-1',
      generatedContent: 'Sub: Test\n\nBody',
      fees: null,
      engagement: {
        id: 'eng-1',
        firmId: 'firm-1',
        clientRequestId: 'req-1',
        title: 'GST — Acme — FY 2025-26',
        billingAmount: null,
        client: { name: 'Acme Pvt Ltd' },
        firm: { id: 'firm-1', name: 'M. K. Dandeker & Co LLP' },
      },
    });

    const deps = {
      engagementLetters: { markSigned },
      engagements: {
        updateLetterStatus,
        updateManyByClientRequestId,
        updateEngagementLetterArtifacts,
      },
      notifications: { notifyFirmPartners },
    } as unknown as MkdWorkflowDeps;

    await acceptEngagementLetterByClient('letter-1', 'client-1', 'Jane Director', deps);

    expect(notifyFirmPartners).toHaveBeenCalledWith(
      expect.objectContaining({
        firmId: 'firm-1',
        title: 'Engagement letter signed',
        link: '/engagements/eng-1',
        message: expect.stringContaining('Acme Pvt Ltd'),
      })
    );
    expect(markClientPortalNotificationsRead).toHaveBeenCalledWith('client-1', {
      titleIncludes: 'Engagement letter',
    });
    expect(markSigned).toHaveBeenCalledOnce();
  });

  it('requires signatory name', async () => {
    const deps = {
      engagementLetters: { markSigned },
      engagements: {},
      notifications: { notifyFirmPartners },
    } as unknown as MkdWorkflowDeps;

    await expect(
      acceptEngagementLetterByClient('letter-1', 'client-1', '   ', deps)
    ).rejects.toMatchObject({ status: 400 });
  });
});
