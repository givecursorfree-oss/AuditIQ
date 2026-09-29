import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, findFirst, findMany, create } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  default: {
    emailThreadMessage: { findUnique, findFirst, findMany, create },
  },
}));

import { ingestInboundReply } from '../emailReplyIngest.js';

describe('ingestInboundReply', () => {
  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
    findMany.mockReset();
    create.mockReset();
  });

  it('stores a reply mapped to the outbound engagement and team', async () => {
    const outboundId = '<out-root@auditiq.local>';
    const replyId = '<reply-1@client.test>';
    findUnique.mockResolvedValueOnce(null); // reply not stored
    findMany
      .mockResolvedValueOnce([
        {
          messageId: outboundId,
          direction: 'outbound',
          threadRootId: outboundId,
          engagementId: 'eng-1',
          clientId: 'cli-1',
          teamUserIds: JSON.stringify(['u-mgr', 'u-art']),
        },
      ])
      .mockResolvedValueOnce([]);
    create.mockResolvedValue({
      id: 'row-1',
      messageId: replyId,
      engagementId: 'eng-1',
      clientId: 'cli-1',
      threadRootId: outboundId,
      teamUserIds: JSON.stringify(['u-mgr', 'u-art']),
    });

    const result = await ingestInboundReply({
      messageId: replyId,
      inReplyTo: outboundId,
      references: outboundId,
      subject: 'Re: GSTR data request',
      fromAddress: 'client@co.test',
      toAddress: 'auditiqmkd@gmail.com',
      ccAddress: 'mgr@firm.test, art@firm.test',
      bodyText: 'Please find attached.',
      imapUid: 'inbox:42',
    });

    expect(result.stored).toBe(true);
    expect(result.engagementId).toBe('eng-1');
    expect(result.teamUserIds).toEqual(['u-mgr', 'u-art']);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: 'inbound',
          engagementId: 'eng-1',
          threadRootId: outboundId,
          imapUid: 'inbox:42',
        }),
      })
    );
  });

  it('skips duplicates and unmatched replies', async () => {
    findUnique.mockResolvedValueOnce({
      id: 'existing',
      engagementId: 'eng-1',
      clientId: 'cli-1',
      teamUserIds: '[]',
      threadRootId: '<x@y>',
    });
    const dup = await ingestInboundReply({
      messageId: '<dup@x>',
      subject: 'Re:',
      fromAddress: 'a@b',
      toAddress: 'c@d',
    });
    expect(dup.duplicate).toBe(true);
    expect(dup.stored).toBe(false);

    findUnique.mockResolvedValueOnce(null);
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const miss = await ingestInboundReply({
      messageId: '<orphan@x>',
      inReplyTo: '<unknown@x>',
      subject: 'Re:',
      fromAddress: 'a@b',
      toAddress: 'c@d',
    });
    expect(miss.unmatched).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
