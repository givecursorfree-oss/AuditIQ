import { describe, expect, it } from 'vitest';
import {
  assertTeamAssignmentAllowed,
  engagementHasTeam,
  needsSignedLetterForTeamAssignment,
} from '../letterGatePolicy.js';

describe('letterGatePolicy', () => {
  it('requires signed letter when status is draft, sent, or rejected', () => {
    expect(needsSignedLetterForTeamAssignment('draft')).toBe(true);
    expect(needsSignedLetterForTeamAssignment('sent')).toBe(true);
    expect(needsSignedLetterForTeamAssignment('rejected')).toBe(true);
  });

  it('does not gate when letter is signed or not required', () => {
    expect(needsSignedLetterForTeamAssignment('signed')).toBe(false);
    expect(needsSignedLetterForTeamAssignment('not_required')).toBe(false);
  });

  it('allows team updates when not assigning team', () => {
    expect(assertTeamAssignmentAllowed('draft', false)).toEqual({ allowed: true });
  });

  it('blocks team assignment when letter is unsigned', () => {
    expect(assertTeamAssignmentAllowed('sent', true)).toEqual({
      allowed: false,
      error: 'Waiting for client to sign engagement letter',
      letterStatus: 'sent',
    });
  });

  it('allows team assignment when letter is signed', () => {
    expect(assertTeamAssignmentAllowed('signed', true)).toEqual({ allowed: true });
  });

  it('allows team updates when team already exists even if letter is unsigned', () => {
    expect(assertTeamAssignmentAllowed('sent', true, true)).toEqual({ allowed: true });
  });

  it('detects existing team from primary assignee fields', () => {
    expect(engagementHasTeam({ managerId: 'u1' })).toBe(true);
    expect(engagementHasTeam({})).toBe(false);
  });
});
