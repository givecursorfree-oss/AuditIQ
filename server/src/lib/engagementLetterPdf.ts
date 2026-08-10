import PDFDocument from 'pdfkit';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getEnv } from './env.js';

export interface EngagementLetterInput {
  firm: {
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    phone?: string | null;
    email?: string | null;
    pan?: string | null;
    gstin?: string | null;
  };
  client: {
    name: string;
    legalName?: string | null;
    address?: string | null;
    pan?: string | null;
    cin?: string | null;
    gstin?: string | null;
    contactName?: string | null;
  };
  engagement: {
    title: string;
    type: string;
    financialYear: string;
    scopeIncluded?: string | null;
    scopeExcluded?: string | null;
    fees?: number | null;
    timelineFrom?: Date | null;
    timelineTo?: Date | null;
  };
  partner: {
    name: string;
    designation?: string;
    membershipNo?: string | null;
  };
}

function fmtDate(d?: Date | null): string {
  if (!d) return '_______________';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtINR(n?: number | null): string {
  if (n == null) return '_______________';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

/**
 * Generates an Engagement Letter PDF and writes it to:
 *   <storageRoot>/<clientName>/<FY>/Correspondence/EL-<engagementTitle>.pdf
 * Returns the absolute file path.
 */
export async function generateEngagementLetterPdf(
  input: EngagementLetterInput
): Promise<string> {
  const root = getEnv().CLIENT_STORAGE_ROOT;
  const slugClient = input.client.name.replace(/[^a-zA-Z0-9 &-]/g, '').trim() || 'Client';
  const slugTitle = input.engagement.title.replace(/[^a-zA-Z0-9 &-]/g, '').trim() || 'Engagement';
  const folder = path.resolve(root, slugClient, input.engagement.financialYear, 'Correspondence');
  await fsp.mkdir(folder, { recursive: true });
  const filePath = path.join(folder, `EL-${slugTitle}.pdf`);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.pipe(stream);

    // Letterhead
    doc.fontSize(18).font('Helvetica-Bold').text(input.firm.name, { align: 'center' });
    doc.moveDown(0.2);
    const addressLine = [input.firm.address, input.firm.city, input.firm.state].filter(Boolean).join(', ');
    if (addressLine) doc.fontSize(10).font('Helvetica').text(addressLine, { align: 'center' });
    const contact = [input.firm.phone, input.firm.email].filter(Boolean).join('  |  ');
    if (contact) doc.fontSize(10).text(contact, { align: 'center' });
    doc.moveDown(1.5);

    // Date and ref
    doc.fontSize(10).text(`Date: ${fmtDate(new Date())}`);
    doc.moveDown(1);

    // Addressee
    doc.font('Helvetica-Bold').fontSize(11).text(input.client.legalName || input.client.name);
    doc.font('Helvetica').fontSize(10);
    if (input.client.address) doc.text(input.client.address);
    if (input.client.contactName) doc.text(`Attn: ${input.client.contactName}`);
    doc.moveDown(1);

    // Subject
    doc.font('Helvetica-Bold').fontSize(11)
      .text(`Subject: Engagement Letter — ${input.engagement.title} (FY ${input.engagement.financialYear})`);
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(10).text('Dear Sir/Madam,');
    doc.moveDown(0.5);
    doc.text(
      `We refer to our recent discussions regarding the captioned engagement. We are pleased to confirm our acceptance and ` +
      `our understanding of the terms of this engagement, as set out below.`,
      { align: 'justify' }
    );
    doc.moveDown(0.8);

    // Scope (included)
    doc.font('Helvetica-Bold').fontSize(11).text('1. Scope of Work — Included');
    doc.font('Helvetica').fontSize(10).text(input.engagement.scopeIncluded || 'To be agreed.', { align: 'justify' });
    doc.moveDown(0.6);

    // Scope (excluded)
    doc.font('Helvetica-Bold').fontSize(11).text('2. Scope of Work — Excluded');
    doc.font('Helvetica').fontSize(10).text(input.engagement.scopeExcluded || 'None specified.', { align: 'justify' });
    doc.moveDown(0.6);

    // Fees
    doc.font('Helvetica-Bold').fontSize(11).text('3. Professional Fees');
    doc.font('Helvetica').fontSize(10).text(
      `Our professional fees for the above scope are ${fmtINR(input.engagement.fees)} (plus applicable GST). ` +
      `Out-of-pocket expenses, if any, will be billed at actuals.`,
      { align: 'justify' }
    );
    doc.moveDown(0.6);

    // Timeline
    doc.font('Helvetica-Bold').fontSize(11).text('4. Timeline');
    doc.font('Helvetica').fontSize(10).text(
      `Engagement period: ${fmtDate(input.engagement.timelineFrom)} to ${fmtDate(input.engagement.timelineTo)}.`,
      { align: 'justify' }
    );
    doc.moveDown(0.6);

    // Standard clauses
    doc.font('Helvetica-Bold').fontSize(11).text('5. Responsibilities & Confidentiality');
    doc.font('Helvetica').fontSize(10).text(
      'Management is responsible for maintenance of books of account, preparation of financial statements, and ' +
      'implementation of internal controls. We will maintain confidentiality of all client information in accordance ' +
      'with the ICAI Code of Ethics.',
      { align: 'justify' }
    );
    doc.moveDown(1.2);

    // Acceptance
    doc.font('Helvetica-Bold').fontSize(11).text('Acceptance');
    doc.font('Helvetica').fontSize(10).text(
      'Please confirm your acceptance of the above terms by signing in the space provided below and returning a ' +
      'copy of this letter to us.',
      { align: 'justify' }
    );
    doc.moveDown(2);

    // Signature blocks
    const sigY = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text(`For ${input.firm.name}`, 56, sigY);
    doc.font('Helvetica').fontSize(10).text('_____________________________', 56, sigY + 50);
    doc.text(input.partner.name, 56, sigY + 65);
    doc.text(input.partner.designation || 'Partner', 56, sigY + 80);
    if (input.partner.membershipNo) doc.text(`M. No. ${input.partner.membershipNo}`, 56, sigY + 95);

    doc.font('Helvetica-Bold').fontSize(10).text('Accepted by Client', 340, sigY);
    doc.font('Helvetica').fontSize(10).text('_____________________________', 340, sigY + 50);
    doc.text('Authorised Signatory', 340, sigY + 65);
    doc.text(`Name: ${input.client.contactName || ''}`, 340, sigY + 80);
    doc.text('Date: _________________', 340, sigY + 95);

    doc.end();
  });

  return filePath;
}
