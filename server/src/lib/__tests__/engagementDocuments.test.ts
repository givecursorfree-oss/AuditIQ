import { describe, expect, it } from 'vitest';
import { isClientSubmittedDocument } from '../engagementDocuments.js';

describe('isClientSubmittedDocument', () => {
  it('returns true for Client Upload folder', () => {
    expect(
      isClientSubmittedDocument({ folder: 'Client Upload', uploadedBy: { role: 'Staff' } })
    ).toBe(true);
  });

  it('returns true when uploaded by Client role regardless of folder', () => {
    expect(
      isClientSubmittedDocument({ folder: 'Current File', uploadedBy: { role: 'Client' } })
    ).toBe(true);
  });

  it('returns false for staff uploads in firm folders', () => {
    expect(
      isClientSubmittedDocument({ folder: 'Workpapers', uploadedBy: { role: 'Staff' } })
    ).toBe(false);
  });
});
