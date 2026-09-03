import prisma from './prisma.js';
import { getEnv } from './env.js';
import logger from './logger.js';

// Immediate sends go through SMTP. Future sends are persisted in EmailOutbox
// and delivered by the scheduler with retry/backoff.

export interface EmailParams {
  to: string;
  cc?: string;
  subject: string;
  body: string; // HTML
  clientId?: string;
  engagementId?: string;
  templateKey?: string;
  metadata?: Record<string, unknown>;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  path?: string;
  content?: string;
  contentType?: string;
}

let transporter: any | null = null;

async function getTransporter() {
  const env = getEnv();
  if (!env.SMTP_HOST) {
    throw new Error('SMTP is not configured');
  }
  if (transporter) return transporter;
  try {
    const nm: any = await import('nodemailer' as string);
    if (!nm) {
      throw new Error('nodemailer is not installed');
    }
    transporter = nm.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    return transporter;
  } catch (err) {
    logger.error('Failed to create SMTP transporter', { error: (err as Error).message });
    throw new Error('Unable to initialize SMTP transport');
  }
}

/**
 * Sends an email directly through SMTP. Every attempt is recorded as sent or
 * failed; this service deliberately does not create queued mail records.
 */
export async function sendEmail(params: EmailParams): Promise<{ id: string; status: string }> {
  try {
    const tx = await getTransporter();
    const env = getEnv();
    await tx.sendMail({
      from: env.SMTP_FROM,
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      html: params.body,
      attachments: params.attachments,
    });
    const log = await createCommsLog(params, 'sent', undefined, new Date());
    return { id: log.id, status: 'sent' };
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Email delivery failed', { error: msg, to: params.to });
    const log = await createCommsLog(params, 'failed', msg);
    throw new EmailDeliveryError(msg, log.id);
  }
}

export async function scheduleEmail(
  params: EmailParams,
  scheduledAt: Date,
  options: { allowImmediate?: boolean } = {}
): Promise<{ id: string; status: string; scheduledAt: Date }> {
  if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) {
    throw new Error('A valid scheduled email date is required');
  }
  if (!options.allowImmediate && scheduledAt.getTime() <= Date.now()) {
    throw new Error('Scheduled email time must be in the future');
  }
  if (options.allowImmediate && scheduledAt.getTime() < Date.now() - 60_000) {
    throw new Error('Immediate scheduled email time is too old');
  }

  const outbox = await prisma.emailOutbox.create({
    data: {
      clientId: params.clientId,
      engagementId: params.engagementId,
      toAddress: params.to,
      ccAddress: params.cc,
      subject: params.subject,
      body: params.body,
      templateKey: params.templateKey || 'other',
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
      attachments: params.attachments ? JSON.stringify(params.attachments) : undefined,
      scheduledAt,
    },
  });
  return { id: outbox.id, status: outbox.status, scheduledAt: outbox.scheduledAt };
}

async function createCommsLog(
  params: EmailParams,
  status: 'sent' | 'failed',
  errorMessage?: string,
  sentAt?: Date
) {
  return prisma.commsLog.create({
    data: {
      clientId: params.clientId,
      engagementId: params.engagementId,
      channel: 'email',
      templateKey: params.templateKey || 'other',
      toAddress: params.to,
      ccAddress: params.cc,
      subject: params.subject,
      body: params.body,
      status,
      errorMessage,
      sentAt,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    },
  });
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseAttachments(raw: string | null): EmailAttachment[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const OUTBOX_RETRY_BASE_MS = 5 * 60 * 1000;
const OUTBOX_RETRY_CAP_MS = 6 * 60 * 60 * 1000;
const OUTBOX_STALE_PROCESSING_MS = 15 * 60 * 1000;

export async function processEmailOutbox(
  limit = 25,
  now = new Date()
): Promise<{ processed: number; sent: number; failed: number; retried: number }> {
  const staleCutoff = new Date(now.getTime() - OUTBOX_STALE_PROCESSING_MS);
  await prisma.emailOutbox.updateMany({
    where: { status: 'processing', lastAttemptAt: { lt: staleCutoff } },
    data: { status: 'scheduled' },
  });

  const due = await prisma.emailOutbox.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { lte: now },
      OR: [{ retryAt: null }, { retryAt: { lte: now } }],
    },
    orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    take: Math.max(1, Math.min(limit, 100)),
  });

  let sent = 0;
  let failed = 0;
  let retried = 0;
  for (const candidate of due) {
    const claimed = await prisma.emailOutbox.updateMany({
      where: { id: candidate.id, status: 'scheduled' },
      data: {
        status: 'processing',
        attempts: { increment: 1 },
        lastAttemptAt: now,
      },
    });
    if (claimed.count !== 1) continue;

    const outbox = await prisma.emailOutbox.findUnique({ where: { id: candidate.id } });
    if (!outbox) continue;

    const metadata = parseJsonObject(outbox.metadata);
    try {
      await sendEmail({
        to: outbox.toAddress,
        cc: outbox.ccAddress ?? undefined,
        subject: outbox.subject,
        body: outbox.body,
        clientId: outbox.clientId ?? undefined,
        engagementId: outbox.engagementId ?? undefined,
        templateKey: outbox.templateKey,
        metadata: { ...metadata, outboxId: outbox.id },
        attachments: parseAttachments(outbox.attachments),
      });
      await prisma.emailOutbox.update({
        where: { id: outbox.id },
        data: { status: 'sent', sentAt: now, retryAt: null, errorMessage: null },
      });
      if (typeof metadata.templateSendId === 'string') {
        await prisma.templateSend
          .update({
            where: { id: metadata.templateSendId },
            data: { deliveryStatus: 'sent', sentAt: now },
          })
          .catch((err) => logger.warn('Template send history update failed', {
            error: (err as Error).message,
            templateSendId: metadata.templateSendId,
          }));
      }
      sent++;
    } catch (err) {
      const message = (err as Error).message;
      const retryDelay = Math.min(
        OUTBOX_RETRY_CAP_MS,
        OUTBOX_RETRY_BASE_MS * 2 ** Math.max(0, outbox.attempts - 1)
      );
      const smtpUnavailable = /SMTP is not configured|Unable to initialize SMTP transport/.test(message);
      const terminal = !smtpUnavailable && outbox.attempts >= outbox.maxAttempts;
      await prisma.emailOutbox.update({
        where: { id: outbox.id },
        data: terminal
          ? { status: 'failed', failedAt: now, errorMessage: message, retryAt: null }
          : { status: 'scheduled', retryAt: new Date(now.getTime() + retryDelay), errorMessage: message },
      });
      if (terminal && typeof metadata.templateSendId === 'string') {
        await prisma.templateSend
          .update({
            where: { id: metadata.templateSendId },
            data: { deliveryStatus: 'failed' },
          })
          .catch((err) => logger.warn('Template send failure update failed', {
            error: (err as Error).message,
            templateSendId: metadata.templateSendId,
          }));
      }
      if (terminal) failed++;
      else retried++;
    }
  }

  return { processed: sent + failed + retried, sent, failed, retried };
}
export class EmailDeliveryError extends Error {
  constructor(message: string, public readonly logId: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

// ── Templates ─────────────────────────────────────────────────────────

const wrap = (firmName: string, body: string) => `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.55">
  <div style="background:#1e3a8a;color:#fff;padding:16px 24px;border-radius:6px 6px 0 0">
    <h2 style="margin:0;font-size:18px;font-weight:600">${firmName}</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 6px 6px">${body}</div>
  <p style="text-align:center;color:#6b7280;font-size:12px;margin-top:16px">
    This is an automated message from AuditIQ. Please contact your CA firm through the portal or your usual support channel.
  </p>
</div>`;

export const emailTemplates = {
  welcome(p: { firmName: string; clientName: string; portalUrl: string; loginEmail: string; tempPassword: string; documentChecklist: string[] }) {
    const items = p.documentChecklist.map(d => `<li>${d}</li>`).join('');
    const body = `
      <p>Dear ${p.clientName},</p>
      <p>Welcome to ${p.firmName}. Your secure client portal is ready. You can use it to upload documents,
      view filing progress, and download invoices.</p>
      <p><strong>Your portal login:</strong></p>
      <ul>
        <li>URL: <a href="${p.portalUrl}">${p.portalUrl}</a></li>
        <li>Email: ${p.loginEmail}</li>
        <li>Temporary password: <code>${p.tempPassword}</code></li>
      </ul>
      <p>Please change your password on first login.</p>
      <p><strong>To get started, please upload the following documents:</strong></p>
      <ul>${items}</ul>
      <p>Warm regards,<br/>${p.firmName}</p>`;
    return { subject: `Welcome to ${p.firmName} — Your portal access`, body: wrap(p.firmName, body) };
  },

  documentFollowup(p: { firmName: string; clientName: string; documents: string[]; engagementTitle: string; attempt: number }) {
    const items = p.documents.map(d => `<li>${d}</li>`).join('');
    const heading = p.attempt === 1
      ? 'Friendly reminder — documents pending'
      : `Reminder #${p.attempt} — documents still pending`;
    const body = `
      <p>Dear ${p.clientName},</p>
      <p>This is a polite ${p.attempt > 1 ? `${p.attempt === 2 ? 'second' : 'third'} ` : ''}reminder regarding the documents we requested for
      <strong>${p.engagementTitle}</strong>. We are still awaiting:</p>
      <ul>${items}</ul>
      <p>Please upload these via your client portal at your earliest convenience so that we can proceed with the work.</p>
      <p>If you have any questions or need help, just reply to this email and we'll be happy to assist.</p>
      <p>Warm regards,<br/>${p.firmName}</p>`;
    return { subject: `${heading} — ${p.engagementTitle}`, body: wrap(p.firmName, body) };
  },

  deadlineReminder(p: { firmName: string; clientName: string; deadlineTitle: string; dueDate: Date; daysAway: number; pendingDocs: string[] }) {
    const items = p.pendingDocs.length
      ? `<p><strong>Documents still pending from your side:</strong></p><ul>${p.pendingDocs.map(d => `<li>${d}</li>`).join('')}</ul>`
      : '<p>We have everything we need from your side — thank you.</p>';
    const body = `
      <p>Dear ${p.clientName},</p>
      <p>This is a reminder that <strong>${p.deadlineTitle}</strong> is due on
      <strong>${p.dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
      (${p.daysAway} day${p.daysAway === 1 ? '' : 's'} away).</p>
      ${items}
      <p>Please reach out if you have any concerns.</p>
      <p>Warm regards,<br/>${p.firmName}</p>`;
    return { subject: `Deadline reminder: ${p.deadlineTitle} — due in ${p.daysAway} day(s)`, body: wrap(p.firmName, body) };
  },

  filingConfirmation(p: { firmName: string; clientName: string; engagementTitle: string; udin: string; filedOn: Date }) {
    const body = `
      <p>Dear ${p.clientName},</p>
      <p>We are pleased to confirm that <strong>${p.engagementTitle}</strong> has been successfully filed on
      ${p.filedOn.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}.</p>
      <p><strong>UDIN:</strong> ${p.udin}</p>
      <p>The filed document is available in your secure client portal for your records. Please keep it safely for future reference.</p>
      <p>Thank you for the opportunity to serve you.</p>
      <p>Warm regards,<br/>${p.firmName}</p>`;
    return { subject: `Filing confirmation — ${p.engagementTitle}`, body: wrap(p.firmName, body) };
  },

  billingManagerReminder(p: {
    managerName: string;
    clientName: string;
    engagementTitle: string;
    daysSince: number;
    engagementId: string;
  }) {
    const body = `
      <p>Dear ${p.managerName},</p>
      <p><strong>${p.clientName}</strong> — engagement <strong>${p.engagementTitle}</strong> was filed
      ${p.daysSince} day${p.daysSince === 1 ? '' : 's'} ago and is still not billed.</p>
      <p>Please follow up: raise the invoice and move the engagement to the Billing stage.</p>
      <p><a href="/billing/pending">Open pending billing</a> · <a href="/engagements/${p.engagementId}">View engagement</a></p>`;
    return {
      subject: `Action required: bill ${p.clientName} — ${p.engagementTitle}`,
      body: wrap('AuditIQ', body),
    };
  },

  billingReminder(p: {
    firmName: string;
    clientName: string;
    engagementTitle: string;
    filedOn: Date;
    daysSince: number;
  }) {
    const body = `
      <p>Dear ${p.clientName},</p>
      <p>This is a gentle reminder regarding billing for <strong>${p.engagementTitle}</strong>,
      which was filed on ${p.filedOn.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
      (${p.daysSince} day${p.daysSince === 1 ? '' : 's'} ago).</p>
      <p>Please let us know if you have any questions about the invoice or payment process.</p>
      <p>Warm regards,<br/>${p.firmName}</p>`;
    return {
      subject: `Billing reminder — ${p.engagementTitle}`,
      body: wrap(p.firmName, body),
    };
  },

  taskDeadlineReminder(p: {
    firmName: string;
    assigneeName: string;
    taskTitle: string;
    engagementTitle: string;
    dueDate: Date;
    daysAway: number;
  }) {
    const body = `
      <p>Dear ${p.assigneeName},</p>
      <p>Reminder: task <strong>${p.taskTitle}</strong> for ${p.engagementTitle} is due on
      ${p.dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
      (${p.daysAway} day${p.daysAway === 1 ? '' : 's'} away).</p>
      <p>Warm regards,<br/>${p.firmName}</p>`;
    return {
      subject: `Task deadline: ${p.taskTitle}`,
      body: wrap(p.firmName, body),
    };
  },

  dailyDigest(p: {
    firmName: string;
    recipientName: string;
    date: Date;
    sections: Record<string, unknown>;
  }) {
    const dateLabel = p.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const s = p.sections;
    const lines: string[] = [`<p>Good morning, ${p.recipientName}. Here is your digest for ${dateLabel}.</p>`];

    const overdue = (s.overdueTasks as { title: string }[] | undefined) || [];
    if (overdue.length) {
      lines.push(`<p><strong>Overdue tasks (${overdue.length})</strong></p><ul>${overdue.map((t) => `<li>${t.title}</li>`).join('')}</ul>`);
    }
    const dueToday = (s.pendingTasks as { title: string }[] | undefined) || [];
    if (dueToday.length) {
      lines.push(`<p><strong>Due today (${dueToday.length})</strong></p><ul>${dueToday.map((t) => `<li>${t.title}</li>`).join('')}</ul>`);
    }
    const dueSoon = (s.tasksDueSoon as { title: string }[] | undefined) || [];
    if (dueSoon.length) {
      lines.push(`<p><strong>Due within 7 days (${dueSoon.length})</strong></p><ul>${dueSoon.map((t) => `<li>${t.title}</li>`).join('')}</ul>`);
    }
    const attendance = s.attendanceSummary as
      | { presentToday: number; absentToday: number; awayNow: number }
      | undefined;
    if (attendance) {
      lines.push(
        `<p><strong>Attendance today:</strong> ${attendance.presentToday} present, ${attendance.absentToday} absent, ${attendance.awayNow} away.</p>`
      );
    }
    if (s.pendingBillingCount) {
      lines.push(`<p><strong>Pending billing:</strong> ${s.pendingBillingCount} engagement(s) filed but not billed.</p>`);
    }
    if (s.pendingApprovalsCount) {
      lines.push(`<p><strong>Claims awaiting approval:</strong> ${s.pendingApprovalsCount}</p>`);
    }

    return {
      subject: `AuditIQ Daily Digest — ${dateLabel}`,
      body: wrap(p.firmName, lines.join('')),
    };
  },
};
