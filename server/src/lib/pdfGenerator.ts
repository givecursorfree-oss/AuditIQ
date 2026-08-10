import PDFDocument from 'pdfkit';
import { Response } from 'express';

interface FirmInfo {
  name: string;
  registrationNo?: string | null;
  pan?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface ClientInfo {
  name: string;
  pan?: string | null;
  cin?: string | null;
  gstin?: string | null;
  address?: string | null;
}

interface EngagementInfo {
  title: string;
  type: string;
  financialYear: string;
  status: string;
}

interface Form3CDClause {
  clauseNumber: number;
  clauseTitle: string;
  response: string | null;
  isApplicable: boolean;
  remarks: string | null;
}

// ── Helpers ──

function addHeader(doc: PDFKit.PDFDocument, firm: FirmInfo): void {
  doc.fontSize(18).font('Helvetica-Bold').text(firm.name, { align: 'center' });
  doc.fontSize(9).font('Helvetica');
  if (firm.address) {
    const parts = [firm.address, firm.city, firm.state].filter(Boolean);
    doc.text(parts.join(', '), { align: 'center' });
  }
  if (firm.registrationNo) doc.text(`Reg No: ${firm.registrationNo}`, { align: 'center' });
  if (firm.pan) doc.text(`PAN: ${firm.pan}  |  GSTIN: ${firm.gstin ?? 'N/A'}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.8);
}

function addFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  doc.fontSize(8).font('Helvetica').text(
    `Page ${pageNum}  |  Generated on ${new Date().toLocaleDateString('en-IN')}  |  Confidential`,
    50,
    doc.page.height - 40,
    { align: 'center', width: 495 },
  );
}

function addSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.5);
  doc.fontSize(13).font('Helvetica-Bold').text(title);
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}

function addKeyValue(doc: PDFKit.PDFDocument, label: string, value: string): void {
  doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true });
  doc.font('Helvetica').text(value || 'N/A');
}

// ── Public API ──

export function generateForm3CDPDF(
  res: Response,
  firm: FirmInfo,
  client: ClientInfo,
  engagement: EngagementInfo,
  clauses: Form3CDClause[],
): void {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Form3CD_${engagement.financialYear}.pdf"`);
  doc.pipe(res);

  // Page 1: Title page
  addHeader(doc, firm);
  doc.moveDown(2);
  doc.fontSize(20).font('Helvetica-Bold').text('FORM NO. 3CD', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica').text(
    '[See rule 6G(2)] — Statement of particulars required to be furnished under section 44AB of the Income-tax Act, 1961',
    { align: 'center' },
  );
  doc.moveDown(2);

  addSectionTitle(doc, 'Client Information');
  addKeyValue(doc, 'Name of Assessee', client.name);
  addKeyValue(doc, 'PAN', client.pan ?? 'N/A');
  addKeyValue(doc, 'CIN', client.cin ?? 'N/A');
  addKeyValue(doc, 'GSTIN', client.gstin ?? 'N/A');
  if (client.address) addKeyValue(doc, 'Address', client.address);

  doc.moveDown(0.5);
  addSectionTitle(doc, 'Engagement Details');
  addKeyValue(doc, 'Engagement', engagement.title);
  addKeyValue(doc, 'Type', engagement.type);
  addKeyValue(doc, 'Assessment Year', engagement.financialYear);
  addKeyValue(doc, 'Status', engagement.status);

  doc.moveDown(0.5);
  addSectionTitle(doc, 'Auditor Information');
  addKeyValue(doc, 'Firm', firm.name);
  addKeyValue(doc, 'Registration No', firm.registrationNo ?? 'N/A');
  addKeyValue(doc, 'PAN', firm.pan ?? 'N/A');

  // Clauses
  doc.addPage();
  addHeader(doc, firm);
  addSectionTitle(doc, 'Form 3CD Clauses');

  for (const clause of clauses) {
    if (doc.y > doc.page.height - 120) {
      doc.addPage();
      addHeader(doc, firm);
    }

    const applicableTag = clause.isApplicable ? '✓ Applicable' : '✗ Not Applicable';
    doc.fontSize(11).font('Helvetica-Bold').text(
      `Clause ${clause.clauseNumber}: ${clause.clauseTitle}`,
    );
    doc.fontSize(9).font('Helvetica').text(applicableTag, { indent: 10 });
    if (clause.response) {
      doc.fontSize(10).font('Helvetica').text(clause.response, { indent: 10 });
    }
    if (clause.remarks) {
      doc.fontSize(9).font('Helvetica-Oblique').text(`Remarks: ${clause.remarks}`, { indent: 10 });
    }
    doc.moveDown(0.6);
  }

  // Signature block
  if (doc.y > doc.page.height - 160) doc.addPage();
  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
  doc.moveDown(1);
  doc.fontSize(10).font('Helvetica').text('Place: __________________', 50);
  doc.text('Date: __________________', 50);
  doc.moveDown(1.5);
  doc.text('Signature of the Tax Auditor', 350);
  doc.text(`Name: ${firm.name}`, 350);
  if (firm.registrationNo) doc.text(`Membership/FRN: ${firm.registrationNo}`, 350);

  // Add page numbers
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    addFooter(doc, i + 1);
  }

  doc.end();
}

export function generateAuditReportPDF(
  res: Response,
  firm: FirmInfo,
  client: ClientInfo,
  engagement: EngagementInfo,
  reportContent: string,
  reportTitle: string,
): void {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  const safeTitle = reportTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_${engagement.financialYear}.pdf"`);
  doc.pipe(res);

  // Title page
  addHeader(doc, firm);
  doc.moveDown(3);
  doc.fontSize(22).font('Helvetica-Bold').text(reportTitle, { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(14).font('Helvetica').text(client.name, { align: 'center' });
  doc.fontSize(12).text(`Assessment Year: ${engagement.financialYear}`, { align: 'center' });
  doc.moveDown(3);

  addSectionTitle(doc, 'Client Details');
  addKeyValue(doc, 'Name', client.name);
  addKeyValue(doc, 'PAN', client.pan ?? 'N/A');
  if (client.address) addKeyValue(doc, 'Address', client.address);

  doc.moveDown(0.5);
  addSectionTitle(doc, 'Engagement');
  addKeyValue(doc, 'Title', engagement.title);
  addKeyValue(doc, 'Type', engagement.type);
  addKeyValue(doc, 'Financial Year', engagement.financialYear);

  // Report content
  doc.addPage();
  addHeader(doc, firm);
  addSectionTitle(doc, 'Report');
  doc.fontSize(10).font('Helvetica').text(reportContent || 'No content available.', {
    align: 'justify',
    lineGap: 2,
  });

  // Signature
  if (doc.y > doc.page.height - 160) doc.addPage();
  doc.moveDown(3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
  doc.moveDown(1);
  doc.text('For ' + firm.name, 350);
  doc.moveDown(2);
  doc.text('Authorised Signatory', 350);
  if (firm.registrationNo) doc.text(`FRN: ${firm.registrationNo}`, 350);

  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    addFooter(doc, i + 1);
  }

  doc.end();
}
