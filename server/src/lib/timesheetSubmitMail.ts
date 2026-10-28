import prisma from './prisma.js';
import logger from './logger.js';
import { sendEmail } from './emailService.js';
import { recentWeekdayKeysBefore } from './timesheetWeekdayGaps.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  );
}

function wrap(firmName: string, body: string): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.55">
  <div style="background:#1e3a8a;color:#fff;padding:16px 24px;border-radius:6px 6px 0 0">
    <h2 style="margin:0;font-size:18px;font-weight:600">${escapeHtml(firmName)}</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 6px 6px">${body}</div>
  <p style="text-align:center;color:#6b7280;font-size:12px;margin-top:16px">
    This is an automated message from AuditIQ. Please contact your CA firm through the portal or your usual support channel.
  </p>
</div>`;
}

function dayBounds(dateStr: string) {
  return {
    start: new Date(`${dateStr}T00:00:00.000+05:30`),
    end: new Date(`${dateStr}T23:59:59.999+05:30`),
  };
}

function entryDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Email the staff member a confirmation of the day they submitted,
 * plus recent weekdays with no time logged.
 */
export async function notifyTimesheetSubmitted(userId: string, dateKey: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      firm: { select: { name: true } },
    },
  });
  if (!user?.email) return;

  const { start, end } = dayBounds(dateKey);
  const gapKeys = recentWeekdayKeysBefore(dateKey, 7);
  const rangeStart = gapKeys.length ? dayBounds(gapKeys[gapKeys.length - 1]!).start : start;
  const rangeEnd = end;

  const entries = await prisma.timeEntry.findMany({
    where: { userId, date: { gte: rangeStart, lte: rangeEnd } },
    select: {
      date: true,
      hours: true,
      workType: true,
      clientName: true,
      description: true,
      engagement: { select: { title: true, client: { select: { name: true } } } },
    },
    orderBy: { date: 'asc' },
  });

  const hoursByDay = new Map<string, number>();
  for (const e of entries) {
    const key = entryDateKey(e.date);
    hoursByDay.set(key, (hoursByDay.get(key) || 0) + (e.hours || 0));
  }

  const dayRows = entries.filter((e) => entryDateKey(e.date) === dateKey);
  const totalHours = dayRows.reduce((sum, e) => sum + (e.hours || 0), 0);
  const missed = gapKeys.filter((k) => !(hoursByDay.get(k) && hoursByDay.get(k)! > 0));

  const name = `${user.firstName} ${user.lastName}`.trim() || 'there';
  const firmName = user.firm?.name || 'AuditIQ';

  const rowHtml =
    dayRows.length === 0
      ? '<p>No time rows found for this day.</p>'
      : `<table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr>
              <th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:6px 4px">Client</th>
              <th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:6px 4px">Engagement</th>
              <th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:6px 4px">Activity</th>
              <th style="text-align:right;border-bottom:1px solid #e5e7eb;padding:6px 4px">Hours</th>
            </tr>
          </thead>
          <tbody>
            ${dayRows
              .map((e) => {
                const client = e.clientName || e.engagement?.client?.name || '—';
                const eng = e.engagement?.title || '—';
                const activity = e.workType || '—';
                return `<tr>
                  <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6">${escapeHtml(client)}</td>
                  <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6">${escapeHtml(eng)}</td>
                  <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6">${escapeHtml(activity)}</td>
                  <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:right">${Number(e.hours).toFixed(2)}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
        <p><strong>Total:</strong> ${totalHours.toFixed(2)} hours</p>`;

  const gapsHtml =
    missed.length === 0
      ? '<p>None — recent weekdays have time logged.</p>'
      : `<ul>${missed.map((k) => `<li>${escapeHtml(k)}</li>`).join('')}</ul>`;

  const body = `
    <p>Dear ${escapeHtml(name)},</p>
    <p>Your timesheet for <strong>${escapeHtml(dateKey)}</strong> was submitted for approval.</p>
    <p><strong>Logged today</strong></p>
    ${rowHtml}
    <p><strong>Recent weekdays with no timesheet</strong></p>
    ${gapsHtml}
    <p>Warm regards,<br/>${escapeHtml(firmName)}</p>`;

  await sendEmail({
    to: user.email,
    subject: `Timesheet submitted — ${dateKey}`,
    body: wrap(firmName, body),
  });
  logger.info('Timesheet submit confirmation emailed', { userId, dateKey, to: user.email });
}
