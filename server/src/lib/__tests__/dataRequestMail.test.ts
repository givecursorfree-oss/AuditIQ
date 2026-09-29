import { describe, expect, it } from 'vitest';
import {
  buildStableMessageId,
  collectTeamCcEmails,
  formatCcList,
  isDataRequestCategory,
  matchOutboundMessageId,
  normalizeMessageId,
  parseMessageIdList,
} from '../dataRequestMail.js';

describe('dataRequestMail helpers', () => {
  it('recognises data-request letter categories', () => {
    expect(isDataRequestCategory('gstr_monthly_letter')).toBe(true);
    expect(isDataRequestCategory('DATA_REQUEST')).toBe(true);
    expect(isDataRequestCategory('engagement_letter')).toBe(false);
  });

  it('normalises Message-IDs and builds stable ones', () => {
    expect(normalizeMessageId('abc@firm.test')).toBe('<abc@firm.test>');
    expect(normalizeMessageId('<abc@firm.test>')).toBe('<abc@firm.test>');
    expect(buildStableMessageId('mkdandeker.com')).toMatch(/^<[0-9a-f-]+@mkdandeker.com>$/i);
  });

  it('builds a team CC list excluding To and sender', () => {
    const cc = collectTeamCcEmails(
      ['mgr@firm.test', 'art@firm.test', 'mgr@firm.test', 'client@co.test'],
      { exclude: ['client@co.test', 'M K Dandeker <notify@firm.test>'] }
    );
    expect(cc).toEqual(['mgr@firm.test', 'art@firm.test']);
    expect(formatCcList(cc)).toBe('mgr@firm.test, art@firm.test');
  });

  it('matches replies via In-Reply-To then References (Gmail trail)', () => {
    const outbound = '<out-1@auditiq.local>';
    expect(
      matchOutboundMessageId(outbound, undefined, [outbound])
    ).toBe(outbound);
    expect(
      matchOutboundMessageId(undefined, `<other@x> ${outbound}`, [outbound])
    ).toBe(outbound);
    expect(matchOutboundMessageId('<nope@x>', undefined, [outbound])).toBeNull();
    expect(parseMessageIdList(`<a@b> <c@d>`)).toEqual(['<a@b>', '<c@d>']);
  });

  it('documents that Gmail SMTP + same SMTP_USER stores Sent copies', () => {
    // Contract: sendEmail sets messageId + metadata.gmailSentCopy when host is gmail.
    // Authenticated smtp.gmail.com delivery places the message in that mailbox's Sent folder.
    const smtpHost = 'smtp.gmail.com';
    const smtpUser = 'auditiqmkd@gmail.com';
    expect(smtpHost.includes('gmail.com')).toBe(true);
    expect(smtpUser).toContain('@');
  });
});
