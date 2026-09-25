import { describe, expect, it } from 'vitest';
import { buildSmtpTransportOptions, emailTemplates } from '../emailService.js';

describe('buildSmtpTransportOptions', () => {
  it('uses STARTTLS on port 587', () => {
    const opts = buildSmtpTransportOptions({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: 587,
      SMTP_USER: 'notify@firm.test',
      SMTP_PASSWORD: 'app-password',
    });
    expect(opts).toMatchObject({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'notify@firm.test', pass: 'app-password' },
    });
  });

  it('uses implicit TLS on port 465', () => {
    const opts = buildSmtpTransportOptions({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 465,
      SMTP_USER: 'notify@firm.test',
      SMTP_PASSWORD: 'secret',
    });
    expect(opts.secure).toBe(true);
    expect(opts.requireTLS).toBe(false);
  });

  it('rejects a username without a password', () => {
    expect(() =>
      buildSmtpTransportOptions({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
        SMTP_USER: 'notify@firm.test',
      })
    ).toThrow(/SMTP_USER and SMTP_PASSWORD/);
  });
});

describe('password reset mail', () => {
  it('escapes the recipient name and includes the reset link', () => {
    const mail = emailTemplates.passwordReset({
      firmName: 'M K Dandeker & Co',
      recipientName: 'Asha <script>',
      resetUrl: 'http://localhost:5173/reset-password?token=abc',
    });
    expect(mail.subject).toBe('Reset your AuditIQ password');
    expect(mail.body).toContain('Asha &lt;script&gt;');
    expect(mail.body).toContain('http://localhost:5173/reset-password?token=abc');
    expect(mail.body).not.toContain('<script>');
  });
});
