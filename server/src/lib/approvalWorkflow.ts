export type WorkflowStepInput = {
  stepOrder: number;
  approverRole?: string | null;
  approverUserId?: string | null;
};

/** Each step must designate a user or role — never leave both empty. */
export function validateWorkflowSteps(steps: WorkflowStepInput[]): string | null {
  for (const step of steps) {
    if (!step.approverUserId && !step.approverRole) {
      return `Step ${step.stepOrder} must specify an approver (user or role)`;
    }
  }
  return null;
}

/** Whether the caller may act on the current pending step (non–Partner/Admin). */
export function isDesignatedApprover(
  userId: string,
  userRole: string,
  designatedUserId: string | null | undefined,
  designatedRole: string | null | undefined
): boolean {
  if (designatedUserId) return designatedUserId === userId;
  if (designatedRole) return designatedRole === userRole;
  return false;
}

type ApprovalStepRow = { stepOrder: number; approverId: string | null; status: string };
type WorkflowStepRow = {
  stepOrder: number;
  approverRole: string | null;
  approverUserId: string | null;
};

export function workflowStepForOrder(
  workflowSteps: WorkflowStepRow[],
  stepOrder: number
): WorkflowStepRow | undefined {
  return workflowSteps.find((s) => s.stepOrder === stepOrder);
}

/** Resolve designated approver for the request's current pending step. */
export function designatedApproverForCurrentStep(
  currentStep: number,
  requestSteps: ApprovalStepRow[],
  workflowSteps: WorkflowStepRow[]
): { userId: string | null; role: string | null } {
  const pending = requestSteps.find(
    (s) => s.stepOrder === currentStep && s.status === 'Pending'
  );
  const ws = workflowStepForOrder(workflowSteps, currentStep);
  return {
    userId: pending?.approverId ?? ws?.approverUserId ?? null,
    role: ws?.approverRole ?? null,
  };
}

export function isPendingApproverForUser(
  userId: string,
  userRole: string,
  request: {
    currentStep: number;
    status: string;
    steps: ApprovalStepRow[];
    workflow: { steps: WorkflowStepRow[] };
  }
): boolean {
  if (request.status !== 'In Progress') return false;
  const { userId: designatedUserId, role: designatedRole } = designatedApproverForCurrentStep(
    request.currentStep,
    request.steps,
    request.workflow.steps
  );
  return isDesignatedApprover(userId, userRole, designatedUserId, designatedRole);
}
