import { describe, it, expect } from 'vitest';
import {
  getServiceProfile,
  serviceRequirementDetail,
  enrichServiceForCatalog,
  normalizeServiceCode,
} from '../serviceRequirements.js';
import { SERVICE_CATALOG } from '../workflowCatalog.js';

describe('serviceRequirements', () => {
  it('covers every catalog service with a profile', () => {
    for (const svc of SERVICE_CATALOG) {
      const profile = getServiceProfile(svc.code);
      expect(profile, `missing profile for ${svc.code}`).not.toBeNull();
      expect(profile!.checklistItems.length).toBeGreaterThan(0);
      expect(profile!.firmWillAsk.length).toBeGreaterThan(0);
    }
  });

  it('normalizes service codes case-insensitively', () => {
    expect(normalizeServiceCode('gstr_1')).toBe('GSTR_1');
    expect(getServiceProfile('gstr_1')?.code).toBe('GSTR_1');
  });

  it('returns grouped requirement detail for GSTR-3B', () => {
    const detail = serviceRequirementDetail('GSTR_3B');
    expect(detail).not.toBeNull();
    expect(detail!.byCategory.some((g) => g.category === 'client_document' && g.items.length > 0)).toBe(true);
    expect(detail!.surfaces.length).toBeGreaterThan(0);
  });

  it('merges GSTR-1 and GSTR-3B work into GST Monthly Returns', () => {
    const profile = getServiceProfile('GST_MONTHLY_RETURNS');
    expect(profile).not.toBeNull();
    const taskTitles = profile!.internalTasks.map((t) => t.title.toLowerCase());
    // GSTR-1 side
    expect(taskTitles.some((t) => t.includes('hsn summary'))).toBe(true);
    expect(taskTitles.some((t) => t.includes('b2b'))).toBe(true);
    expect(taskTitles.some((t) => t.includes('gstr-1'))).toBe(true);
    // GSTR-3B side
    expect(taskTitles.some((t) => t.includes('gstr-3b'))).toBe(true);
    expect(taskTitles.some((t) => t.includes('2b'))).toBe(true);
  });

  it('enriches catalog entries with counts', () => {
    const svc = SERVICE_CATALOG.find((s) => s.code === 'STATUTORY_AUDIT')!;
    const enriched = enrichServiceForCatalog(svc);
    expect(enriched.summary).toBeTruthy();
    expect(enriched.clientDocumentCount).toBeGreaterThan(0);
  });
});
