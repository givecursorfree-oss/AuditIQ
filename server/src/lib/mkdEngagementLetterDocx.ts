import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

const SECTION_HEADERS = new Set([
  'Scope of Services:',
  'Scope and Process:',
  'Professional Fees:',
  'General Terms:',
  'Accepted and Agreed:',
]);

export type MkdLetterDocxInput = {
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
    signedAt: Date;
  };
};

function letterUploadDir(letterId: string): string {
  return path.resolve('uploads', 'engagement-letters', letterId);
}

export function mkdLetterDocxPath(letterId: string, variant: 'draft' | 'signed' = 'draft'): string {
  return path.join(letterUploadDir(letterId), variant === 'signed' ? 'signed.docx' : 'draft.docx');
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

function paragraphForLine(raw: string): Paragraph {
  const trimmed = raw.trim();
  if (!trimmed) {
    return new Paragraph({ spacing: { after: 120 } });
  }
  if (trimmed === '---') {
    return new Paragraph({ spacing: { before: 200, after: 200 } });
  }
  if (trimmed === 'Engagement Letter') {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: trimmed, bold: true, size: 28 })],
    });
  }
  if (trimmed.startsWith('Sub:')) {
    return new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: trimmed, bold: true, size: 22 })],
    });
  }
  if (isSectionHeader(trimmed) || isPartnerBlock(trimmed)) {
    return new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text: trimmed, bold: true, size: 22 })],
    });
  }
  if (trimmed.startsWith('- ')) {
    return new Paragraph({
      spacing: { after: 60 },
      indent: { left: 360 },
      children: [new TextRun({ text: trimmed, size: 21 })],
    });
  }
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: trimmed, size: 21 })],
  });
}

export async function renderMkdEngagementLetterDocx(input: MkdLetterDocxInput): Promise<string> {
  const dir = letterUploadDir(input.letterId);
  await fsp.mkdir(dir, { recursive: true });
  const variant = input.clientSignature ? 'signed' : 'draft';
  const filePath = mkdLetterDocxPath(input.letterId, variant);

  const addr = [input.firm.address, input.firm.city, input.firm.state].filter(Boolean).join(', ');
  const contact = [input.firm.phone, input.firm.email].filter(Boolean).join('  |  ');

  const header: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: input.firm.name, bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Chartered Accountants', size: 20 })],
    }),
  ];
  if (addr) {
    header.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: addr, size: 18 })],
      })
    );
  }
  if (contact) {
    header.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: contact, size: 18 })],
      })
    );
  }

  let bodyText = input.content.replace(/\r\n/g, '\n');
  if (input.clientSignature) {
    const sig = input.clientSignature;
    const dateStr = sig.signedAt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    bodyText = bodyText
      .replace(/Authorised Signatory\s*\n\s*Date: _+/, `Authorised Signatory\n\n${sig.signatoryName}\n\nDate: ${dateStr}`)
      .replace(/Date: ___________/, `Date: ${dateStr}`);
  }

  const body = bodyText.split('\n').map((line) => paragraphForLine(line));

  const doc = new Document({
    sections: [{ properties: {}, children: [...header, ...body] }],
  });

  const buffer = await Packer.toBuffer(doc);
  await fsp.writeFile(filePath, buffer);
  return filePath;
}

export function resolveEngagementLetterDocxPath(
  letter: { docxPath?: string | null; signedDocumentUrl?: string | null; status: string }
): string | null {
  if (letter.status === 'signed' && letter.signedDocumentUrl && fs.existsSync(letter.signedDocumentUrl)) {
    return letter.signedDocumentUrl;
  }
  if (letter.docxPath && fs.existsSync(letter.docxPath)) {
    return letter.docxPath;
  }
  return null;
}
