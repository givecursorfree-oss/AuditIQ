import { describe, expect, it, vi } from 'vitest';

vi.mock('../engagementLetterWorkflow.js', () => ({
  generateEngagementLetter: vi.fn().mockResolvedValue({ letter: { id: 'letter-1' }, preview: '' }),
}));

vi.mock('../../lib/clientScope.js', () => ({
  notifyClientPortalUsers: vi.fn().mockResolvedValue(undefined),
}));

import { approveClientRequest } from '../approveClientRequest.js';
import type { MkdWorkflowDeps } from '../../repositories/index.js';

describe('approveClientRequest use case', () => {
  it('creates one engagement per service and notifies partners', async () => {
    const notifyFirmPartners = vi.fn().mockResolvedValue(undefined);
    const approveWithEngagements = vi.fn().mockResolvedValue([
      { id: 'eng-1', title: 'GST — Acme — FY 2025-26' },
      { id: 'eng-2', title: 'ITR — Acme — FY 2025-26' },
    ]);

    const deps = {
      clientRequests: {
        findPendingById: vi.fn().mockResolvedValue({
          id: 'req-1',
          firmId: 'firm-1',
          clientId: 'client-1',
          selectedServices: ['GSTR_3B', 'ITR_JULY'],
          financialYears: ['2025-26'],
          notes: null,
          client: { name: 'Acme' },
        }),
        approveWithEngagements,
        reject: vi.fn(),
      },
      notifications: { notifyFirmPartners },
      engagements: {} as MkdWorkflowDeps['engagements'],
      engagementLetters: {} as MkdWorkflowDeps['engagementLetters'],
      documentTemplates: {} as MkdWorkflowDeps['documentTemplates'],
      users: {} as MkdWorkflowDeps['users'],
    } satisfies MkdWorkflowDeps;

    const result = await approveClientRequest(
      { requestId: 'req-1', firmId: 'firm-1', reviewerId: 'user-1' },
      deps
    );

    expect(result.serviceCount).toBe(2);
    expect(result.primaryEngagementId).toBe('eng-1');
    expect(approveWithEngagements).toHaveBeenCalledOnce();
    expect(approveWithEngagements.mock.calls[0][2]).toHaveLength(2);
    expect(notifyFirmPartners).toHaveBeenCalledWith(
      expect.objectContaining({
        link: '/engagements/eng-1/letter',
        message: expect.stringContaining('2 engagement(s)'),
      })
    );
  });

  it('throws when request is not pending', async () => {
    const deps = {
      clientRequests: {
        findPendingById: vi.fn().mockResolvedValue(null),
        approveWithEngagements: vi.fn(),
        reject: vi.fn(),
      },
      notifications: { notifyFirmPartners: vi.fn() },
      engagements: {} as MkdWorkflowDeps['engagements'],
      engagementLetters: {} as MkdWorkflowDeps['engagementLetters'],
      documentTemplates: {} as MkdWorkflowDeps['documentTemplates'],
      users: {} as MkdWorkflowDeps['users'],
    } satisfies MkdWorkflowDeps;

    await expect(
      approveClientRequest({ requestId: 'x', firmId: 'f', reviewerId: 'u' }, deps)
    ).rejects.toMatchObject({ status: 404 });
  });
});
