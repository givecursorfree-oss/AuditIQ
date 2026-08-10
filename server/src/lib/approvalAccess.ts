import {
  designatedApproverForCurrentStep,
  isDesignatedApprover,
  validateWorkflowSteps,
  type WorkflowStepInput,
} from './approvalWorkflow.js';

type RequestStep = { stepOrder: number; approverId: string | null; status?: string };
type WorkflowStep = { stepOrder: number; approverRole: string | null; approverUserId: string | null };

/** Whether a staff user may read a single approval request (Partners/Admins see all). */
export function canViewApprovalRequest(
  role: string,
  userId: string,
  request: {
    requesterId: string;
    approverIds: (string | null)[];
    currentStep?: number;
    status?: string;
    steps?: RequestStep[];
    workflowSteps?: WorkflowStep[];
  }
): boolean {
  if (['Partner', 'Admin'].includes(role)) return true;
  if (request.requesterId === userId) return true;
  if (request.approverIds.some((id) => id === userId)) return true;

  if (
    request.currentStep != null &&
    request.steps &&
    request.workflowSteps &&
    request.status === 'In Progress'
  ) {
    const { userId: designatedUserId, role: designatedRole } = designatedApproverForCurrentStep(
      request.currentStep,
      request.steps.map((s) => ({ ...s, status: s.status ?? 'Pending' })),
      request.workflowSteps
    );
    if (isDesignatedApprover(userId, role, designatedUserId, designatedRole)) return true;
  }

  return false;
}

export { isDesignatedApprover, validateWorkflowSteps };
export type { WorkflowStepInput };
