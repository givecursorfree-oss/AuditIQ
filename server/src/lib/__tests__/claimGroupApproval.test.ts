import { describe, expect, it } from 'vitest';
import { resolveParticipantManagerId, rollupManagerApprovals } from '../claimGroupApproval.js';

describe('resolveParticipantManagerId', () => {
  const engagementMap = new Map([
    [
      'eng-1',
      { managerId: 'mgr-1', partnerInChargeId: 'ptr-1', articleAssistantId: 'aa-1' },
    ],
  ]);

  it('prefers explicit manager over reportsTo and engagement', () => {
    expect(resolveParticipantManagerId('sup-1', 'eng-1', engagementMap, 'picked-1')).toBe('picked-1');
  });

  it('prefers reportsTo over engagement manager', () => {
    expect(resolveParticipantManagerId('sup-1', 'eng-1', engagementMap)).toBe('sup-1');
  });

  it('falls back to engagement manager when reportsTo is missing', () => {
    expect(resolveParticipantManagerId(null, 'eng-1', engagementMap)).toBe('mgr-1');
  });

  it('returns null when no manager source exists', () => {
    expect(resolveParticipantManagerId(null, undefined, engagementMap)).toBeNull();
  });
});

describe('rollupManagerApprovals', () => {
  it('keeps claim partial when one manager rejects and another is still pending', () => {
    const result = rollupManagerApprovals([
      { status: 'approved', teamAmount: 333.33 },
      { status: 'rejected', teamAmount: 333.33 },
      { status: 'pending', teamAmount: 333.34 },
    ]);
    expect(result.claimStatus).toBe('partially_approved');
    expect(result.approvedSum).toBeCloseTo(333.33, 2);
  });

  it('rejects only when every manager rejected (or nothing left to pay)', () => {
    expect(
      rollupManagerApprovals([
        { status: 'rejected', teamAmount: 100 },
        { status: 'rejected', teamAmount: 100 },
      ]).claimStatus
    ).toBe('rejected');
  });

  it('stays approved when all managers accept', () => {
    const result = rollupManagerApprovals([
      { status: 'approved', teamAmount: 200 },
      { status: 'approved', teamAmount: 300 },
    ]);
    expect(result.claimStatus).toBe('approved');
    expect(result.approvedSum).toBe(500);
  });
});
