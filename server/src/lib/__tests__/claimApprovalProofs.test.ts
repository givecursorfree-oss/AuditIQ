import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { generateApprovalPdf, type ClaimExportData } from '../claimApprovalExport.js';
import { mergeApprovalCoverWithProofs } from '../claimApprovalProofs.js';

/** Minimal 1×1 JPEG */
const TINY_JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
  'base64'
);

const sample: ClaimExportData = {
  title: 'DETAILS OF LATE SITTING EXPENSE',
  date_str: 'Sunday, 30 August 2026',
  manager_name: 'Test Manager',
  client_name: 'Acme',
  submission_date: '30.08.2026',
  paid_by: [{ name: 'Alice', amount: 500 }],
  attendees: [{ name: 'Alice', work: 'Audit' }],
};

describe('mergeApprovalCoverWithProofs', () => {
  it('appends 2x2 proof pages after the approval cover', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-proofs-'));
    const imgPath = path.join(dir, 'receipt.jpg');
    fs.writeFileSync(imgPath, TINY_JPG);
    const cover = path.join(dir, 'cover.pdf');
    const out = path.join(dir, 'package.pdf');
    await generateApprovalPdf(sample, cover);
    await mergeApprovalCoverWithProofs(
      cover,
      [
        {
          claimantName: 'Alice',
          dateLabel: '30.08.2026',
          amount: 500,
          filePath: imgPath,
          mimeType: 'image/jpeg',
          fileName: 'receipt.jpg',
        },
      ],
      out
    );
    expect(fs.statSync(out).size).toBeGreaterThan(fs.statSync(cover).size);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
