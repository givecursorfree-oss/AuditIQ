import fs from 'fs';
import path from 'path';
import logger from './logger.js';

/**
 * Magic-byte validation for uploaded files. Extension checks alone are
 * spoofable — a renamed executable passes a `.pdf` filter. This verifies
 * the on-disk content actually matches the claimed extension.
 *
 * Text formats (csv, txt) have no signature; they are scanned for
 * disallowed binary signatures instead (PE/ELF/Mach-O executables).
 */

type SignatureCheck = (buf: Buffer) => boolean;

const startsWith = (hex: string): SignatureCheck => {
  const sig = Buffer.from(hex, 'hex');
  return (buf) => buf.length >= sig.length && buf.subarray(0, sig.length).equals(sig);
};

const isZip = startsWith('504b0304'); // xlsx / docx / pptx / zip
const isOle = startsWith('d0cf11e0a1b11ae1'); // legacy xls / doc / ppt
const isRiffWebp: SignatureCheck = (buf) =>
  buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';

const SIGNATURES: Record<string, SignatureCheck[]> = {
  '.pdf': [startsWith('255044462d')], // %PDF-
  '.png': [startsWith('89504e470d0a1a0a')],
  '.jpg': [startsWith('ffd8ff')],
  '.jpeg': [startsWith('ffd8ff')],
  '.gif': [startsWith('474946383761'), startsWith('474946383961')],
  '.webp': [isRiffWebp],
  '.xlsx': [isZip],
  '.docx': [isZip],
  '.pptx': [isZip],
  '.zip': [isZip],
  '.xls': [isOle],
  '.doc': [isOle],
  '.ppt': [isOle],
};

const EXECUTABLE_SIGNATURES: SignatureCheck[] = [
  startsWith('4d5a'), // PE (Windows .exe / .dll)
  startsWith('7f454c46'), // ELF
  startsWith('cafebabe'), // Mach-O fat / Java class
  startsWith('feedface'),
  startsWith('feedfacf'),
  startsWith('23212f'), // #!/ shebang scripts
];

/**
 * Validate an in-memory upload buffer against its claimed extension.
 * Returns null when valid, or an error message when the file should be rejected.
 */
export function validateBufferSignature(buf: Buffer, originalName: string): string | null {
  const head = buf.subarray(0, 16);

  if (EXECUTABLE_SIGNATURES.some((check) => check(head))) {
    return 'Executable files are not allowed';
  }

  const ext = path.extname(originalName).toLowerCase();
  const checks = SIGNATURES[ext];
  if (!checks) return null; // text formats (csv/txt) — executable scan above is enough
  if (checks.some((check) => check(head))) return null;
  return `File content does not match its ${ext} extension`;
}

/**
 * Validate a stored upload against its claimed extension.
 * Returns null when valid, or an error message when the file should be rejected.
 */
export function validateFileSignature(storagePath: string, originalName: string): string | null {
  let head: Buffer;
  try {
    const fd = fs.openSync(storagePath, 'r');
    head = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    head = head.subarray(0, bytesRead);
  } catch (err) {
    logger.error('File signature read failed', { error: (err as Error).message });
    return 'Could not verify uploaded file';
  }
  return validateBufferSignature(head, originalName);
}

/** Validate and delete the file when invalid. Returns error message or null. */
export function validateUploadOrRemove(storagePath: string, originalName: string): string | null {
  const error = validateFileSignature(storagePath, originalName);
  if (error) {
    try {
      fs.unlinkSync(storagePath);
    } catch {
      /* already gone */
    }
    logger.warn('Rejected upload by magic-byte check', { originalName, error });
  }
  return error;
}
