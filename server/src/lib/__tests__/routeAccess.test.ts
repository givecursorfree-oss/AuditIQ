import { describe, expect, it } from 'vitest';
import {
  canViewSensitiveEmployeeData,
  canDownloadEmployeeDocument,
  isSelfOnlyEmployeeRole,
} from '../employeeAccess.js';
import { canViewApprovalRequest } from '../approvalAccess.js';
import {
  isDesignatedApprover,
  isPendingApproverForUser,
  validateWorkflowSteps,
} from '../approvalWorkflow.js';

describe('employeeAccess', () => {
  it('treats Staff and Intern as self-only', () => {
    expect(isSelfOnlyEmployeeRole('Staff')).toBe(true);
    expect(isSelfOnlyEmployeeRole('Intern')).toBe(true);
    expect(isSelfOnlyEmployeeRole('Manager')).toBe(false);
  });

  it('grants sensitive fields to leadership and employees:manage', () => {
    expect(canViewSensitiveEmployeeData('Partner', [])).toBe(true);
    expect(canViewSensitiveEmployeeData('Manager', ['employees:view'])).toBe(false);
    expect(canViewSensitiveEmployeeData('Manager', ['employees:manage'])).toBe(true);
  });

  it('allows document download for self or sensitive viewers only', () => {
    expect(canDownloadEmployeeDocument('Staff', [], 'u1', 'u1')).toBe(true);
    expect(canDownloadEmployeeDocument('Staff', [], 'u1', 'u2')).toBe(false);
    expect(canDownloadEmployeeDocument('Manager', ['employees:edit'], 'u1', 'u2')).toBe(true);
  });
});

describe('approvalAccess', () => {
  it('allows Partner/Admin to view any request', () => {
    expect(
      canViewApprovalRequest('Partner', 'p1', { requesterId: 'x', approverIds: [] })
    ).toBe(true);
  });

  it('allows requester and designated approvers only', () => {
    const req = { requesterId: 'r1', approverIds: ['a1', null] };
    expect(canViewApprovalRequest('Staff', 'r1', req)).toBe(true);
    expect(canViewApprovalRequest('Staff', 'a1', req)).toBe(true);
    expect(canViewApprovalRequest('Staff', 'other', req)).toBe(false);
  });

  it('allows role-based approver on current in-progress step', () => {
    expect(
      canViewApprovalRequest('Manager', 'm1', {
        requesterId: 'r1',
        approverIds: [null],
        currentStep: 1,
        status: 'In Progress',
        steps: [{ stepOrder: 1, approverId: null, status: 'Pending' }],
        workflowSteps: [{ stepOrder: 1, approverRole: 'Manager', approverUserId: null }],
      })
    ).toBe(true);
  });
});

describe('approvalWorkflow', () => {
  it('rejects steps with no approver', () => {
    expect(validateWorkflowSteps([{ stepOrder: 1 }])).toMatch(/must specify/);
    expect(
      validateWorkflowSteps([{ stepOrder: 1, approverRole: 'Manager' }])
    ).toBeNull();
  });

  it('does not treat empty designation as open step', () => {
    expect(isDesignatedApprover('u1', 'Staff', null, null)).toBe(false);
    expect(isDesignatedApprover('u1', 'Manager', null, 'Manager')).toBe(true);
  });

  it('detects pending approver by role', () => {
    const request = {
      currentStep: 1,
      status: 'In Progress',
      steps: [{ stepOrder: 1, approverId: null, status: 'Pending' }],
      workflow: {
        steps: [{ stepOrder: 1, approverRole: 'Partner', approverUserId: null }],
      },
    };
    expect(isPendingApproverForUser('p1', 'Partner', request)).toBe(true);
    expect(isPendingApproverForUser('s1', 'Staff', request)).toBe(false);
  });

  it('denies role-based approver when step is not current', () => {
    expect(
      canViewApprovalRequest('Manager', 'm1', {
        requesterId: 'r1',
        approverIds: [null],
        currentStep: 2,
        status: 'In Progress',
        steps: [
          { stepOrder: 1, approverId: 'm1', status: 'Approved' },
          { stepOrder: 2, approverId: null, status: 'Pending' },
        ],
        workflowSteps: [
          { stepOrder: 1, approverRole: 'Manager', approverUserId: null },
          { stepOrder: 2, approverRole: 'Partner', approverUserId: null },
        ],
      })
    ).toBe(false);
  });

  it('denies unrelated staff from viewing in-progress request', () => {
    expect(
      canViewApprovalRequest('Staff', 's9', {
        requesterId: 'r1',
        approverIds: [null],
        currentStep: 1,
        status: 'In Progress',
        steps: [{ stepOrder: 1, approverId: null, status: 'Pending' }],
        workflowSteps: [{ stepOrder: 1, approverRole: 'Manager', approverUserId: null }],
      })
    ).toBe(false);
  });
});
