import prisma from './prisma.js';
import { getEnv } from './env.js';
import logger from './logger.js';

// We avoid hard-coding `nodemailer` as a required dependency; instead we
// dynamically import it if SMTP is configured. When SMTP isn't configured
// the email is logged + stored in the database with status="queued" so
// developers can inspect what would have been sent.

export interface EmailParams {
  to: string;
  cc?: string;
  subject: string;
  body: string; // HTML
  clientId?: string;
  engagementId?: string;
  templateKey?: string;
  metadata?: Record<string, unknown>;
}

let transporter: any | null = null;

async function getTransporter() {
  const env = getEnv();
  if (!env.SMTP_HOST) return null;
  if (transporter) return transporter;
  try {
    // Optional dependency — only loaded if SMTP is configured
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — nodemailer is an optional peer dep
    const nm: any = await import('nodemailer' as string).catch(() => null);
    if (!nm) {
      logger.warn('SMTP configured but nodemailer not installed; emails will be logged only');
      return null;
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
    return null;
  }
}

/**
 * Sends an email through SMTP if configured, otherwise queues it in the
 * CommsLog table. In either case, a CommsLog row is always created so
 * every outbound communication is traceable.
 */
export async function sendEmail(params: EmailParams): Promise<{ id: string; status: string }> {
  const env = getEnv();

  const log = await prisma.commsLog.create({
    data: {
      clientId: params.clientId,
      engagementId: params.engagementId,
      channel: 'email',
      templateKey: params.templateKey || 'other',
      toAddress: params.to,
      ccAddress: params.cc,
      subject: params.subject,
      body: params.body,
      status: 'queued',
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    },
  });

  const tx = await getTransporter();
  if (!tx) {
    logger.info('[email queued — SMTP not configured]', { to: params.to, subject: params.subject });
    return { id: log.id, status: 'queued' };
  }

  try {
    await tx.sendMail({
      from: env.SMTP_FROM,
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      html: params.body,
    });
    await prisma.commsLog.update({
      where: { id: log.id },
      data: { status: 'sent', sentAt: new Date() },
    });
    return { id: log.id, status: 'sent' };
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Email send failed', { error: msg, to: params.to });
    await prisma.commsLog.update({
      where: { id: log.id },
      data: { status: 'failed', errorMessage: msg },
    });
    return { id: log.id, status: 'failed' };
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
    This is an automated message from AuditIQ. Please do not reply directly to this email.
  </p>
</div>`;

export const emailTemplates = {
  welcome(p: { firmName: string; clientName: string; portalUrl: string; loginEmail: string; tempPassword: string; documentChecklist: string[] }) {
    const items = p.documentChecklist.map(d => `<li>${d}</li>`).join('');
    const body = `
      <p>Dear ${p.clientName},</p>
      <p>Welcome on board! We are delighted to have you as a client. We have created a secure portal where you
      can upload documents, view the status of your filings, and download invoices.</p>
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
      <p>The filed document is attached for your records. Please keep it safely for future reference.</p>
      <p>Thank you for the opportunity to serve you.</p>
      <p>Warm regards,<br/>${p.firmName}</p>`;
    return { subject: `Filing confirmation — ${p.engagementTitle}`, body: wrap(p.firmName, body) };
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
