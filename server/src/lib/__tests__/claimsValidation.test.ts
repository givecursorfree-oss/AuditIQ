import { describe, expect, it } from 'vitest';

const GST_IT_TYPES = new Set(['GST', 'Tax (44AB)']);

function isValidDeptVisitEngagementType(type: string): boolean {
  return GST_IT_TYPES.has(type);
}

describe('dept visit claim engagement validation', () => {
  it('allows GST and Tax (44AB) engagement types', () => {
    expect(isValidDeptVisitEngagementType('GST')).toBe(true);
    expect(isValidDeptVisitEngagementType('Tax (44AB)')).toBe(true);
  });

  it('rejects statutory and internal audit types', () => {
    expect(isValidDeptVisitEngagementType('Statutory')).toBe(false);
    expect(isValidDeptVisitEngagementType('Internal')).toBe(false);
  });
});
