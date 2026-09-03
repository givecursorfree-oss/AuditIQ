import { describe, expect, it } from 'vitest';
import { resolveParticipantManagerId } from '../claimGroupApproval.js';

describe('resolveParticipantManagerId', () => {
  const engagementMap = new Map([
    [
      'eng-1',
      { managerId: 'mgr-1', partnerInChargeId: 'ptr-1', articleAssistantId: 'aa-1' },
    ],
  ]);

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
