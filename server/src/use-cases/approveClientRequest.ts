import {
  engagementTitleForService,
  recurringMeta,
  serviceLabel,
  serviceMeta,
} from '../lib/clientRequestHelpers.js';
import type { MkdWorkflowDeps } from '../repositories/index.js';
import { mkdWorkflowDeps } from '../repositories/index.js';
import { notifyClientPortalUsers } from '../lib/clientScope.js';
import { generateEngagementLetter } from './engagementLetterWorkflow.js';
import type { CreateEngagementFromRequestInput } from '../repositories/ports.js';
import { UseCaseError } from './errors.js';

export type ApproveClientRequestInput = {
  requestId: string;
  firmId: string;
  reviewerId: string;
};

export type ApproveClientRequestResult = {
  requestId: string;
  engagements: Awaited<ReturnType<MkdWorkflowDeps['clientRequests']['approveWithEngagements']>>;
  primaryEngagementId: string | undefined;
  serviceCount: number;
};

export async function approveClientRequest(
  input: ApproveClientRequestInput,
  deps: MkdWorkflowDeps = mkdWorkflowDeps
): Promise<ApproveClientRequestResult> {
  const request = await deps.clientRequests.findPendingById(input.requestId, input.firmId);

  if (!request) {
    throw new UseCaseError('Pending request not found', 404);
  }

  const services = request.selectedServices as string[];
  if (!services.length) {
    throw new UseCaseError('Request has no services', 400);
  }

  const years = request.financialYears as string[];
  const fy = years[0] ?? '2025-26';
  const scopeList = services.map((c) => `• ${serviceLabel(c)}`).join('\n');
  const scopeIncluded = [scopeList, request.notes].filter(Boolean).join('\n\n');

  const engagementPayloads: CreateEngagementFromRequestInput[] = services.map((code) => {
    const meta = serviceMeta(code);
    const { isRecurring, recurringFrequency } = recurringMeta(code);
    return {
      title: engagementTitleForService(code, request.client.name, fy),
      type: meta.type,
      financialYear: fy,
      workflowDomain: meta.domain,
      serviceCode: meta.code,
      scopeIncluded,
      isRecurring,
      recurringFrequency,
      firmId: request.firmId,
      clientId: request.clientId,
      clientRequestId: request.id,
    };
  });

  const engagements = await deps.clientRequests.approveWithEngagements(
    request.id,
    input.reviewerId,
    engagementPayloads
  );

  const primaryEngagementId = engagements[0]?.id;
  const serviceCount = engagements.length;

  await deps.notifications.notifyFirmPartners({
    firmId: request.firmId,
    title: 'Request approved — generate engagement letter',
    message: `${request.client.name}: ${serviceCount} engagement(s) created. Generate and send the engagement letter before team assignment.`,
    link: primaryEngagementId
      ? `/engagements/${primaryEngagementId}/letter`
      : `/requests/${request.id}`,
  });

  if (primaryEngagementId) {
    try {
      await generateEngagementLetter({
        engagementId: primaryEngagementId,
        firmId: request.firmId,
        userId: input.reviewerId,
      });
    } catch {
      /* letter draft optional — firm can regenerate from engagement */
    }

    await notifyClientPortalUsers(request.clientId, {
      title: 'Request approved',
      message:
        'Your service request was approved. Your engagement letter is being prepared and will appear on your dashboard for review and signature.',
      link: '/client/dashboard',
      type: 'success',
    }).catch(() => {});
  }

  return {
    requestId: request.id,
    engagements,
    primaryEngagementId,
    serviceCount,
  };
}
