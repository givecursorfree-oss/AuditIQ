import { describe, expect, it, vi, beforeEach } from 'vitest';

const { clientRequestFindMany, engagementFindMany } = vi.hoisted(() => ({
  clientRequestFindMany: vi.fn(),
  engagementFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  default: {
    clientRequest: { findMany: clientRequestFindMany },
    engagement: { findMany: engagementFindMany },
  },
}));

import { buildDashboardActionQueue } from '../dashboardActionQueue.js';

describe('buildDashboardActionQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientRequestFindMany.mockResolvedValue([]);
    engagementFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
  });

  it('prioritizes new requests before signed and awaiting signature items', async () => {
    const submitted = new Date('2026-06-10T10:00:00Z');
    clientRequestFindMany.mockResolvedValue([
      {
        id: 'req-1',
        submittedAt: submitted,
        selectedServices: ['GSTR_3B'],
        client: { name: 'Acme Pvt Ltd' },
      },
    ]);
    engagementFindMany
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: 'eng-signed',
          title: 'ITR — Acme',
          elSignedAt: new Date('2026-06-12T10:00:00Z'),
          client: { name: 'Acme Pvt Ltd' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'eng-sent',
          title: 'GST — Acme',
          client: { name: 'Acme Pvt Ltd' },
          engagementLetter: { sentAt: new Date('2026-06-11T10:00:00Z') },
        },
      ]);

    const queue = await buildDashboardActionQueue('firm-1');

    expect(queue.summary).toEqual({
      total: 3,
      actionable: 2,
      newRequests: 1,
      letterSigned: 1,
      awaitingSignature: 1,
    });
    expect(queue.items.map((i) => i.kind)).toEqual([
      'new_request',
      'letter_signed',
      'awaiting_signature',
    ]);
    expect(queue.items[0].href).toBe('/requests/req-1');
    expect(queue.items[0].actionLabel).toBe('Review & approve');
    expect(queue.items[1].href).toBe('/engagements/eng-signed');
    expect(queue.items[1].actionLabel).toBe('Assign team');
  });
});
