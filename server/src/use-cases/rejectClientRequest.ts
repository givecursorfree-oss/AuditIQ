import type { MkdWorkflowDeps } from '../repositories/index.js';
import { mkdWorkflowDeps } from '../repositories/index.js';
import { UseCaseError } from './errors.js';

export type RejectClientRequestInput = {
  requestId: string;
  firmId: string;
  reviewerId: string;
  reason?: string | null;
};

export async function rejectClientRequest(
  input: RejectClientRequestInput,
  deps: MkdWorkflowDeps = mkdWorkflowDeps
): Promise<{ requestId: string }> {
  const request = await deps.clientRequests.findPendingById(input.requestId, input.firmId);
  if (!request) {
    throw new UseCaseError('Pending request not found', 404);
  }

  await deps.clientRequests.reject(
    request.id,
    input.firmId,
    input.reviewerId,
    input.reason ?? null
  );

  return { requestId: request.id };
}
