import crypto from 'crypto';
import { getEnv } from './env.js';

// AES-256-GCM for password vault. Encrypted payload format:
//   base64( iv(12) || authTag(16) || ciphertext )
// The key is derived from VAULT_ENCRYPTION_KEY using SHA-256 so any
// reasonable input length produces a valid 32-byte key.

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = getEnv().VAULT_ENCRYPTION_KEY;
  // Normalise: try hex, base64, then fall back to SHA-256 hash of raw string
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    cachedKey = Buffer.from(raw, 'hex');
  } else {
    try {
      const b = Buffer.from(raw, 'base64');
      cachedKey = b.length === 32 ? b : crypto.createHash('sha256').update(raw, 'utf8').digest();
    } catch {
      cachedKey = crypto.createHash('sha256').update(raw, 'utf8').digest();
    }
  }
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + 16 + 1) throw new Error('Invalid vault payload');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Mask a password for display: returns dots of fixed length. */
export function maskedDisplay(): string {
  return '••••••••';
}
