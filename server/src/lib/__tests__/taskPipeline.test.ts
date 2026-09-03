import { describe, expect, it } from 'vitest';
import {
  inferPipelineStageFromTitle,
  isValidPipelineStageForEngagement,
  pipelineStageLabel,
  resolveTaskPipelineStage,
} from '../taskPipeline.js';

describe('taskPipeline', () => {
  it('infers FILING from filing-related titles', () => {
    expect(inferPipelineStageFromTitle('File GSTR-3B return')).toBe('FILING');
    expect(inferPipelineStageFromTitle('Generate UDIN and issue final report')).toBe('FILING');
  });

  it('infers ARTICLE_TASK from preparation titles', () => {
    expect(inferPipelineStageFromTitle('Reconcile GSTR-2B vs Purchase Register')).toBe('ARTICLE_TASK');
  });

  it('defaults to engagement current stage when title is ambiguous', () => {
    expect(
      resolveTaskPipelineStage({
        title: 'Misc follow-up',
        engagement: { currentStage: 'Audit Manager Review', type: 'GST' },
      })
    ).toBe('MANAGER_REVIEW');
  });

  it('labels pipeline stage for GST engagement', () => {
    expect(pipelineStageLabel('FILING', { type: 'GST', serviceCode: 'GSTR_3B' })).toBe('Filing');
  });

  it('validates stage against service pipeline', () => {
    expect(isValidPipelineStageForEngagement('FILING', { type: 'GST', serviceCode: 'GSTR_1' })).toBe(
      true
    );
    expect(isValidPipelineStageForEngagement('DATA_PENDING', { type: 'Statutory' })).toBe(true);
  });
});
