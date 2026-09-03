import type { EngagementLetter } from '@prisma/client';
import {
  buildDefaultTemplateVars,
  formatFeeTable,
  renderTemplate,
} from '../lib/templateRenderer.js';
import { scheduleEmail, sendEmail } from '../lib/emailService.js';
import { serviceLabels } from '../lib/clientRequestHelpers.js';
import {
  renderMkdEngagementLetterDocx,
  resolveEngagementLetterDocxPath,
} from '../lib/mkdEngagementLetterDocx.js';
import { provisionClientFolders } from '../lib/folderProvisioner.js';
import { markClientPortalNotificationsRead, notifyClientPortalUsers } from '../lib/clientScope.js';
import prisma from '../lib/prisma.js';
import { teamAssignmentPath } from '../lib/teamAssignmentRoutes.js';
import type { MkdWorkflowDeps } from '../repositories/index.js';
import { mkdWorkflowDeps } from '../repositories/index.js';
import { UseCaseError } from './errors.js';

export type FeeLine = { particular: string; amount: string };

export { resolveEngagementLetterDocxPath };

const awaitingSignatureData = {
  letterStatus: 'sent' as const,
  requestStatus: 'awaiting_letter_signature' as const,
  elSignedAt: null,
  elSignedById: null,
};

/** Undo staff "Mark signed" — only the client portal may finalize signatures. */
export async function revertStaffPrematureLetterSignatures(clientId: string): Promise<void> {
  const wronglySigned = await prisma.engagement.findMany({
    where: {
      clientId,
      letterStatus: 'signed',
      elSignedById: { not: null },
    },
    include: { engagementLetter: true },
  });

  for (const eng of wronglySigned) {
    await prisma.$transaction(async (tx) => {
      await tx.engagement.update({
        where: { id: eng.id },
        data: awaitingSignatureData,
      });
      if (eng.clientRequestId) {
        await tx.engagement.updateMany({
          where: { clientRequestId: eng.clientRequestId },
          data: awaitingSignatureData,
        });
      }
      if (eng.engagementLetter) {
        await tx.engagementLetter.update({
          where: { id: eng.engagementLetter.id },
          data: { status: 'sent', signedAt: null },
        });
      }
    });
  }
}

function parseLetterFeesTotal(fees: unknown, fallback: number | null): number | null {
  if (!Array.isArray(fees) || !fees.length) return fallback;
  const total = (fees as FeeLine[]).reduce((sum, line) => {
    const n = Number(String(line.amount ?? '').replace(/[^\d.]/g, ''));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  return total > 0 ? total : fallback;
}

function extractSubjectLine(content: string): string | undefined {
  const match = content.match(/^Sub:\s*(.+)$/m);
  return match?.[1]?.trim();
}

async function renderLetterDocx(
  letterId: string,
  firm: Parameters<typeof renderMkdEngagementLetterDocx>[0]['firm'],
  content: string,
  clientSignature?: { signatoryName: string; signedAt: Date }
): Promise<string> {
  return renderMkdEngagementLetterDocx({
    firm,
    letterId,
    content,
    clientSignature,
  });
}

export type GenerateEngagementLetterInput = {
  engagementId: string;
  firmId: string;
  userId: string;
  templateId?: string;
  fees?: FeeLine[];
  partnerName?: string;
  scopeOfServices?: string;
  scopeAndProcess?: string;
};

async function propagateLetterStatus(
  deps: MkdWorkflowDeps,
  clientRequestId: string | null,
  engagementId: string,
  data: { letterStatus: string; requestStatus: string }
): Promise<void> {
  await deps.engagements.updateLetterStatus(engagementId, data);
  if (clientRequestId) {
    await deps.engagements.updateManyByClientRequestId(clientRequestId, data);
  }
}

export async function generateEngagementLetter(
  input: GenerateEngagementLetterInput,
  deps: MkdWorkflowDeps = mkdWorkflowDeps
): Promise<{ letter: EngagementLetter; preview: string }> {
  const eng = await deps.engagements.findForLetterWorkflow(input.engagementId, input.firmId);
  if (!eng) throw new UseCaseError('Engagement not found', 404);

  const existingLetter = await deps.engagementLetters.findByEngagementId(input.engagementId);
  if (existingLetter && ['sent', 'signed'].includes(existingLetter.status)) {
    throw new UseCaseError(
      'Cannot edit the engagement letter after it has been sent to the client. Wait for client signature or contact support.',
      409
    );
  }

  const partnerName =
    input.partnerName || (await deps.users.findDisplayName(input.userId));
  const template = await deps.documentTemplates.findActiveForFirm(input.firmId, input.templateId);
  const services = (eng.clientRequest?.selectedServices as string[] | undefined) ?? [];
  const years = (eng.clientRequest?.financialYears as string[] | undefined) ?? [eng.financialYear];
  const fees = input.fees ?? [];

  const vars = buildDefaultTemplateVars({
    client: eng.client,
    firm: eng.firm,
    partnerName,
    financialYears: years,
    serviceDescription: input.scopeOfServices || serviceLabels(services) || eng.title,
    engagementType: eng.serviceCode ?? eng.type,
  });
  vars.SCOPE_OF_SERVICES = input.scopeOfServices ?? (eng.scopeIncluded ?? serviceLabels(services));
  vars.SCOPE_AND_PROCESS =
    input.scopeAndProcess ??
    'We will obtain necessary information from your team, prepare the deliverables, and coordinate reviews before filing.';
  vars.FEE_TABLE = formatFeeTable(fees);

  const content = template ? renderTemplate(template.body, vars) : String(vars.SCOPE_OF_SERVICES);
  const subjectLine = extractSubjectLine(content) ?? template?.subject ?? null;

  let letter = await deps.engagementLetters.upsertDraft({
    engagementId: eng.id,
    clientId: eng.clientId,
    templateId: template?.id,
    generatedContent: content,
    subjectLine: subjectLine ?? undefined,
    fees: fees.length ? fees : undefined,
    partnerName,
    createdById: input.userId,
  });

  try {
    const docxPath = await renderLetterDocx(letter.id, eng.firm, content);
    letter = await deps.engagementLetters.updateDraft(letter.id, { docxPath });
  } catch {
    /* DOCX optional on generate */
  }

  await propagateLetterStatus(deps, eng.clientRequestId, eng.id, {
    letterStatus: 'draft',
    requestStatus: 'awaiting_letter_signature',
  });

  return { letter, preview: content };
}

export type UpdateEngagementLetterInput = {
  letterId: string;
  firmId: string;
  generatedContent: string;
  subjectLine?: string;
  fees?: FeeLine[];
  partnerName?: string;
};

export async function updateEngagementLetterDraft(
  input: UpdateEngagementLetterInput,
  deps: MkdWorkflowDeps = mkdWorkflowDeps
): Promise<EngagementLetter> {
  const letter = await deps.engagementLetters.findByIdForFirm(input.letterId, input.firmId);
  if (!letter) throw new UseCaseError('Engagement letter not found', 404);
  if (letter.status !== 'draft') {
    throw new UseCaseError('Only draft letters can be edited.', 409);
  }

  const content = input.generatedContent.trim();
  if (!content) throw new UseCaseError('Letter body cannot be empty.', 400);

  const subjectLine = input.subjectLine?.trim() || extractSubjectLine(content);
  const eng = await deps.engagements.findForLetterWorkflow(letter.engagementId, input.firmId);
  if (!eng) throw new UseCaseError('Engagement not found', 404);

  let updated = await deps.engagementLetters.updateDraft(letter.id, {
    generatedContent: content,
    subjectLine: subjectLine ?? undefined,
    fees: input.fees,
    partnerName: input.partnerName,
  });

  try {
    const docxPath = await renderLetterDocx(letter.id, eng.firm, content);
    updated = await deps.engagementLetters.updateDraft(letter.id, { docxPath });
  } catch {
    /* DOCX optional */
  }

  return updated;
}

export async function sendEngagementLetter(
  letterId: string,
  firmId: string,
  deps: MkdWorkflowDeps = mkdWorkflowDeps,
  scheduledAt?: Date
): Promise<EngagementLetter> {
  const letter = await deps.engagementLetters.findByIdForFirm(letterId, firmId);
  if (!letter) throw new UseCaseError('Engagement letter not found', 404);
  if (letter.status !== 'draft') {
    throw new UseCaseError('Only draft letters can be sent.', 409);
  }
  if (!letter.generatedContent?.trim()) {
    throw new UseCaseError('Generate or save the letter before sending.', 400);
  }

  const eng = await deps.engagements.findForLetterWorkflow(letter.engagementId, firmId);
  if (!eng) throw new UseCaseError('Engagement not found', 404);

  let docxPath = letter.docxPath;
  try {
    docxPath = await renderLetterDocx(letter.id, eng.firm, letter.generatedContent);
    await deps.engagementLetters.updateDraft(letter.id, { docxPath });
  } catch {
    /* continue without DOCX */
  }

  const subject =
    letter.subjectLine ??
    letter.template?.subject ??
    `Engagement Letter — ${letter.engagement.title}`;
  const portalNote =
    '<p style="margin:16px 0 0"><strong>Next step:</strong> Log in to your client dashboard to review the engagement letter and sign by entering your authorised signatory name.</p>';

  if (letter.client.contactEmail) {
    const emailParams = {
      to: letter.client.contactEmail,
      subject,
      body: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5"><p>Dear Sir/Madam,</p><p>Your engagement letter for <strong>${letter.engagement.title}</strong> is ready for review on your client portal.</p>${portalNote}</div>`,
      clientId: letter.clientId,
      engagementId: letter.engagementId,
      templateKey: 'engagement_letter',
      metadata: { engagementLetterId: letter.id },
      attachments: docxPath
        ? [{
            filename: `${letter.engagement.title.replace(/[^\w.-]+/g, '_')}-engagement-letter.docx`,
            path: docxPath,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }]
        : undefined,
    };
    if (scheduledAt) {
      await scheduleEmail(emailParams, scheduledAt);
    } else {
      await sendEmail(emailParams);
    }
  }

  const now = new Date();
  const siblingUpdate = {
    letterStatus: 'sent',
    requestStatus: 'awaiting_letter_signature',
  };

  const updated = await deps.engagementLetters.markSent(letter.id, now, docxPath ?? undefined);
  await deps.engagements.updateLetterStatus(letter.engagementId, siblingUpdate);
  if (letter.engagement.clientRequestId) {
    await deps.engagements.updateManyByClientRequestId(letter.engagement.clientRequestId, siblingUpdate);
  }

  await notifyClientPortalUsers(letter.clientId, {
    title: 'Engagement letter ready',
    message:
      'Your engagement letter is on your dashboard. Please review it and sign with your authorised signatory name so your CA firm can assign your team.',
    link: '/client/dashboard',
    type: 'info',
  }).catch(() => {});

  return updated;
}

export type SignEngagementLetterInput = {
  letterId: string;
  firmId: string;
  userId: string;
  signedDocumentUrl?: string;
};

export async function signEngagementLetter(
  _input: SignEngagementLetterInput,
  _deps: MkdWorkflowDeps = mkdWorkflowDeps
): Promise<EngagementLetter> {
  throw new UseCaseError(
    'Engagement letters must be signed by the client from their portal. Staff cannot mark letters as signed.',
    403
  );
}

export async function acceptEngagementLetterByClient(
  letterId: string,
  clientId: string,
  signatoryName: string,
  deps: MkdWorkflowDeps = mkdWorkflowDeps
): Promise<EngagementLetter> {
  const name = signatoryName.trim();
  if (!name) throw new UseCaseError('Authorised signatory name is required.', 400);

  const letter = await prisma.engagementLetter.findFirst({
    where: { id: letterId, clientId, status: 'sent' },
    include: { engagement: { include: { client: true, firm: true } } },
  });
  if (!letter) throw new UseCaseError('Pending engagement letter not found', 404);

  const now = new Date();
  const eng = letter.engagement;
  const billingAmount = parseLetterFeesTotal(letter.fees, eng.billingAmount ?? null);
  const signedData = {
    letterStatus: 'signed' as const,
    requestStatus: 'request_approved',
    elSignedAt: now,
    elSignedById: null,
    ...(billingAmount != null ? { billingAmount } : {}),
  };

  let signedDocxPath: string | null = null;
  const content = letter.generatedContent ?? '';
  try {
    signedDocxPath = await renderLetterDocx(letter.id, eng.firm, content, {
      signatoryName: name,
      signedAt: now,
    });
  } catch {
    /* signed DOCX optional */
  }

  const updated = await deps.engagementLetters.markSigned(letter.id, {
    signedAt: now,
    signedDocumentUrl: signedDocxPath,
    clientSignatoryName: name,
  });
  await deps.engagements.updateLetterStatus(letter.engagementId, signedData);
  if (eng.clientRequestId) {
    await deps.engagements.updateManyByClientRequestId(eng.clientRequestId, signedData);
  }

  try {
    await provisionClientFolders(eng.client.name, eng.financialYear);
    if (signedDocxPath) {
      await deps.engagements.updateEngagementLetterArtifacts(eng.id, {
        elGenerated: true,
        elStoragePath: signedDocxPath,
      });
    }
  } catch {
    /* optional */
  }

  await deps.notifications.notifyFirmPartners({
    firmId: eng.firmId,
    title: 'Engagement letter signed',
    message: `${eng.client.name} signed the engagement letter for "${eng.title}". Assign partner and team when ready.`,
    link: teamAssignmentPath(eng.id),
  });

  await markClientPortalNotificationsRead(letter.clientId, {
    titleIncludes: 'Engagement letter',
  }).catch(() => {});

  await prisma.notification
    .updateMany({
      where: {
        isRead: false,
        link: `/engagements/${eng.id}/letter`,
        user: { firmId: eng.firmId, role: { in: ['Partner', 'Admin'] }, isActive: true },
      },
      data: { isRead: true },
    })
    .catch(() => {});

  return updated;
}
