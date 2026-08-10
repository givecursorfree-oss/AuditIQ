import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  generateToken,
  hashToken,
  failedAttemptUpdate,
  isLocked,
  maskPan,
  LOCKOUT_THRESHOLD,
} from '../authSecurity.js';
import { generateTotpSecret, verifyTotp, base32Decode, totpAuthUri } from '../totp.js';
import { validateBufferSignature } from '../fileSignature.js';

describe('authSecurity', () => {
  it('generates unique tokens and deterministic hashes', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).toHaveLength(64); // sha256 hex
  });

  it('locks the account at the threshold', () => {
    const before = failedAttemptUpdate(LOCKOUT_THRESHOLD - 2);
    expect(before.lockedUntil).toBeNull();

    const atThreshold = failedAttemptUpdate(LOCKOUT_THRESHOLD - 1);
    expect(atThreshold.failedLoginCount).toBe(LOCKOUT_THRESHOLD);
    expect(atThreshold.lockedUntil).toBeInstanceOf(Date);
    expect(isLocked({ lockedUntil: atThreshold.lockedUntil })).toBe(true);
  });

  it('treats expired lockouts as unlocked', () => {
    expect(isLocked({ lockedUntil: new Date(Date.now() - 1000) })).toBe(false);
    expect(isLocked({ lockedUntil: null })).toBe(false);
  });

  it('masks PAN keeping only last 4 characters', () => {
    expect(maskPan('AAAPL1234C')).toBe('******234C');
  });
});

describe('totp', () => {
  it('verifies a code generated for the current time step', () => {
    const secret = generateTotpSecret();
    const key = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', key).update(msg).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = String(
      (((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)) % 1000000
    ).padStart(6, '0');

    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(code === '000000');
    expect(verifyTotp(secret, 'abc123')).toBe(false);
  });

  it('builds a valid otpauth URI', () => {
    const uri = totpAuthUri('ABCDEF234567', 'partner@firm.in');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=ABCDEF234567');
    expect(uri).toContain('issuer=AuditIQ');
  });
});

describe('fileSignature', () => {
  it('accepts a real PDF header', () => {
    const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ', 'latin1');
    expect(validateBufferSignature(pdf, 'report.pdf')).toBeNull();
  });

  it('rejects mismatched content vs extension', () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d', 'hex');
    expect(validateBufferSignature(png, 'invoice.pdf')).toMatch(/does not match/);
  });

  it('rejects executables regardless of extension', () => {
    const exe = Buffer.from('4d5a90000300000004000000', 'hex');
    expect(validateBufferSignature(exe, 'notes.txt')).toMatch(/Executable/);
  });

  it('allows text files without signatures', () => {
    const csv = Buffer.from('name,pan,amount\n', 'utf8');
    expect(validateBufferSignature(csv, 'data.csv')).toBeNull();
  });

  it('accepts xlsx (zip container)', () => {
    const zip = Buffer.from('504b03041400', 'hex');
    expect(validateBufferSignature(zip, 'ledger.xlsx')).toBeNull();
  });
});
