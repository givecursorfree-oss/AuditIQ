import PDFDocument from 'pdfkit';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const SECTION_HEADERS = new Set([
  'Scope of Services:',
  'Scope and Process:',
  'Professional Fees:',
  'General Terms:',
  'Accepted and Agreed:',
]);

export type MkdLetterPdfInput = {
  firm: {
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  letterId: string;
  content: string;
  clientSignature?: {
    signatoryName: string;
    signatureImagePath?: string | null;
    signedAt: Date;
  };
};

function letterUploadDir(letterId: string): string {
  return path.resolve('uploads', 'engagement-letters', letterId);
}

export function mkdLetterPdfPath(letterId: string, variant: 'draft' | 'signed' = 'draft'): string {
  return path.join(letterUploadDir(letterId), variant === 'signed' ? 'signed.pdf' : 'draft.pdf');
}

function isSectionHeader(line: string): boolean {
  const t = line.trim();
  return SECTION_HEADERS.has(t) || t.startsWith('Sub:') || t === 'Engagement Letter';
}

function isPartnerBlock(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith('For M.') ||
    t.startsWith('For {{FIRM') ||
    t === 'Chartered Accountants' ||
    t === 'Partner' ||
    t.endsWith('Partner')
  );
}

export async function renderMkdEngagementLetterPdf(input: MkdLetterPdfInput): Promise<string> {
  const dir = letterUploadDir(input.letterId);
  await fsp.mkdir(dir, { recursive: true });
  const variant = input.clientSignature ? 'signed' : 'draft';
  const filePath = mkdLetterPdfPath(input.letterId, variant);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.pipe(stream);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Letterhead
    doc.font('Helvetica-Bold').fontSize(14).text(input.firm.name, { align: 'center' });
    doc.font('Helvetica').fontSize(10).text('Chartered Accountants', { align: 'center' });
    doc.moveDown(0.15);
    const addr = [input.firm.address, input.firm.city, input.firm.state].filter(Boolean).join(', ');
    if (addr) doc.fontSize(9).text(addr, { align: 'center' });
    const contact = [input.firm.phone, input.firm.email].filter(Boolean).join('  |  ');
    if (contact) doc.fontSize(9).text(contact, { align: 'center' });
    doc.moveDown(0.8);
    doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).strokeColor('#1e3a8a').lineWidth(1).stroke();
    doc.moveDown(1);

    const lines = input.content.replace(/\r\n/g, '\n').split('\n');
    let inFeeTable = false;

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        doc.moveDown(0.35);
        inFeeTable = false;
        continue;
      }

      const trimmed = line.trim();

      if (trimmed === '---') {
        doc.moveDown(0.5);
        doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
        doc.moveDown(0.5);
        continue;
      }

      if (trimmed === 'Engagement Letter') {
        doc.font('Helvetica-Bold').fontSize(13).text(trimmed, { align: 'center' });
        doc.moveDown(0.6);
        continue;
      }

      if (trimmed.startsWith('Sub:')) {
        doc.font('Helvetica-Bold').fontSize(10).text(trimmed, { align: 'justify', underline: false });
        doc.moveDown(0.5);
        continue;
      }

      if (trimmed === 'Professional Fees:') {
        inFeeTable = true;
        doc.font('Helvetica-Bold').fontSize(10).text(trimmed);
        doc.moveDown(0.25);
        continue;
      }

      if (inFeeTable && (trimmed === 'Particulars' || trimmed.startsWith('Fee ('))) {
        doc.font('Helvetica-Bold').fontSize(9).text(trimmed);
        continue;
      }

      if (isSectionHeader(trimmed)) {
        inFeeTable = false;
        doc.moveDown(0.15);
        doc.font('Helvetica-Bold').fontSize(10).text(trimmed);
        doc.moveDown(0.2);
        continue;
      }

      if (trimmed.startsWith('- ')) {
        doc.font('Helvetica').fontSize(9.5).text(trimmed, { indent: 12, align: 'justify' });
        continue;
      }

      if (isPartnerBlock(trimmed)) {
        doc.font('Helvetica-Bold').fontSize(9.5).text(trimmed);
        continue;
      }

      doc.font('Helvetica').fontSize(9.5).text(trimmed, { align: 'justify' });
    }

    // Client signature block
    if (input.clientSignature) {
      doc.moveDown(1.2);
      const sig = input.clientSignature;
      const sigY = doc.y;
      const signColX = doc.page.width - 56 - 200;

      doc.font('Helvetica-Bold').fontSize(9.5).text('Accepted and Agreed', signColX, sigY, { width: 200 });
      doc.font('Helvetica').fontSize(9).text(sig.signatoryName, signColX, sigY + 36, { width: 200 });

      if (sig.signatureImagePath && fs.existsSync(sig.signatureImagePath)) {
        try {
          doc.image(sig.signatureImagePath, signColX, sigY + 14, { width: 120, height: 40 });
        } catch {
          /* ignore bad image */
        }
      } else {
        doc.font('Helvetica-Oblique').fontSize(11).text(sig.signatoryName, signColX, sigY + 18, { width: 200 });
      }

      doc.font('Helvetica').fontSize(9).text(
        `Date: ${sig.signedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`,
        signColX,
        sigY + 58,
        { width: 200 }
      );
    }

    doc.end();
  });

  return filePath;
}
