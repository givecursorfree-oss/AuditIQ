import { describe, expect, it } from 'vitest';
import {
  designatedApproverForCurrentStep,
  isDesignatedApprover,
  isPendingApproverForUser,
  validateWorkflowSteps,
} from '../approvalWorkflow.js';

describe('approvalWorkflow', () => {
  it('validateWorkflowSteps requires user or role per step', () => {
    expect(validateWorkflowSteps([{ stepOrder: 1, approverUserId: null, approverRole: null }])).not.toBeNull();
    expect(validateWorkflowSteps([{ stepOrder: 1, approverRole: 'Manager' }])).toBeNull();
    expect(validateWorkflowSteps([{ stepOrder: 1, approverUserId: 'uuid' }])).toBeNull();
  });

  it('isDesignatedApprover rejects undesignated steps', () => {
    expect(isDesignatedApprover('u1', 'Staff', undefined, undefined)).toBe(false);
    expect(isDesignatedApprover('u1', 'Staff', 'u1', null)).toBe(true);
    expect(isDesignatedApprover('u2', 'Manager', null, 'Manager')).toBe(true);
  });

  it('designatedApproverForCurrentStep prefers step approverId', () => {
    const result = designatedApproverForCurrentStep(
      1,
      [{ stepOrder: 1, approverId: 'user-a', status: 'Pending' }],
      [{ stepOrder: 1, approverRole: 'Manager', approverUserId: 'user-b' }]
    );
    expect(result.userId).toBe('user-a');
  });

  it('isPendingApproverForUser matches role when no user assigned', () => {
    const base = {
      currentStep: 2,
      status: 'In Progress',
      steps: [
        { stepOrder: 1, approverId: 'x', status: 'Approved' },
        { stepOrder: 2, approverId: null, status: 'Pending' },
      ],
      workflow: {
        steps: [
          { stepOrder: 1, approverRole: null, approverUserId: 'x' },
          { stepOrder: 2, approverRole: 'Manager', approverUserId: null },
        ],
      },
    };
    expect(isPendingApproverForUser('m1', 'Manager', base)).toBe(true);
    expect(isPendingApproverForUser('s1', 'Staff', base)).toBe(false);
  });
});
