import { describe, expect, it } from 'vitest';
import {
  createClientAuditQuerySchema,
  reportQueryBodySchema,
  isReportDerivedQuery,
  staffEngagementQueriesLink,
  clientPortalQueriesLink,
} from '../clientAuditQueries.js';

describe('createClientAuditQuerySchema', () => {
  it('accepts valid payload', () => {
    const body = createClientAuditQuerySchema.parse({
      engagementId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      subject: 'Clarification on stock valuation',
      body: 'Please confirm the inventory count date used.',
    });
    expect(body.subject).toHaveLength(32);
  });

  it('rejects subject over 200 characters', () => {
    expect(() =>
      createClientAuditQuerySchema.parse({
        engagementId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        subject: 'x'.repeat(201),
        body: 'Valid body',
      })
    ).toThrow();
  });

  it('rejects body over 5000 characters', () => {
    expect(() =>
      createClientAuditQuerySchema.parse({
        engagementId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        subject: 'Valid',
        body: 'y'.repeat(5001),
      })
    ).toThrow();
  });
});

describe('reportQueryBodySchema', () => {
  it('accepts query field', () => {
    const body = reportQueryBodySchema.parse({ query: 'What is the basis?' });
    expect(body.query).toBe('What is the basis?');
  });

  it('rejects empty payload', () => {
    expect(() => reportQueryBodySchema.parse({})).toThrow();
  });
});

describe('client audit query links', () => {
  it('builds staff deep link with queries tab', () => {
    expect(staffEngagementQueriesLink('eng-1')).toBe('/engagements/eng-1?tab=queries');
  });

  it('builds client portal deep link with queries tab', () => {
    expect(clientPortalQueriesLink()).toBe('/client/dashboard?tab=queries');
  });

  it('detects report-derived subjects', () => {
    expect(isReportDerivedQuery('Query on report: Draft report')).toBe(true);
    expect(isReportDerivedQuery('General question')).toBe(false);
  });
});
