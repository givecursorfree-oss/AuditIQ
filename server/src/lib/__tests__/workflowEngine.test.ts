import { describe, it, expect } from 'vitest';
import {
  getEngagementWorkflowMeta,
  clientProgressBuckets,
  canRoleMoveToStep,
  buildClientPortalTimeline,
} from '../workflowEngine.js';

describe('workflowEngine', () => {
  it('resolves IDT template for GSTR service', () => {
    const meta = getEngagementWorkflowMeta({
      currentStage: 'Data request',
      workflowDomain: 'IDT',
      serviceCode: 'GSTR_1',
      type: 'GST',
    });
    expect(meta.templateId).toBe('IDT_GST_RETURN');
    expect(meta.domain).toBe('IDT');
    expect(meta.currentCode).toBe('DATA_REQUEST');
  });

  it('maps audit legacy stage labels', () => {
    const meta = getEngagementWorkflowMeta({
      currentStage: 'Partner Review',
      workflowDomain: 'AUDIT',
      type: 'Statutory',
    });
    expect(meta.templateId).toBe('AUDIT_STATUTORY');
    expect(meta.currentCode).toBe('PARTNER_REVIEW');
  });

  it('returns compliance client progress buckets for DT', () => {
    const buckets = clientProgressBuckets('DT_COMPLIANCE');
    expect(buckets).toHaveLength(4);
    expect(buckets[0].label).toBe('Data & preparation');
  });

  it('allows Partner to move to partner review step', () => {
    expect(canRoleMoveToStep('Partner', 'PARTNER_REVIEW', 'DT_COMPLIANCE')).toBe(true);
    expect(canRoleMoveToStep('Staff', 'PARTNER_REVIEW', 'DT_COMPLIANCE')).toBe(false);
  });

  it('builds client portal timeline from GSTR-1 service steps', () => {
    const timeline = buildClientPortalTimeline(
      {
        currentStage: 'Article executive task',
        workflowDomain: 'IDT',
        serviceCode: 'GSTR_1',
        type: 'GST',
      },
      [{ toStage: 'Data request', createdAt: new Date('2026-01-05') }]
    );
    expect(timeline.templateId).toBe('IDT_GST_RETURN');
    expect(timeline.stages.some((s) => s.id === 'PARTNER_REVIEW')).toBe(false);
    expect(timeline.stages.find((s) => s.status === 'active')?.id).toBe('ARTICLE_TASK');
    expect(timeline.stages[0].status).toBe('completed');
  });
});
