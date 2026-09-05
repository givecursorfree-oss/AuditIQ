import { describe, expect, it } from 'vitest';
import { buildTeamMemberRows } from '../engagementTeam.js';

describe('buildTeamMemberRows', () => {
  it('does not duplicate a user who is both partner and manager', () => {
    const { memberRows } = buildTeamMemberRows('eng-1', ['u-partner'], ['u-staff'], 'u-partner');
    const userIds = memberRows.map((r) => r.userId);
    expect(userIds).toEqual(['u-partner', 'u-staff']);
    expect(memberRows.find((r) => r.userId === 'u-partner')?.teamRole).toBe('Manager');
  });

  it('adds a Partner member row when partner is not already on the team', () => {
    const { memberRows } = buildTeamMemberRows('eng-1', ['u-mgr'], ['u-staff'], 'u-partner');
    expect(memberRows).toHaveLength(3);
    expect(memberRows.find((r) => r.teamRole === 'Partner')?.userId).toBe('u-partner');
  });
});
