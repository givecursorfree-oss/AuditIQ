import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  generateApprovalExcel,
  generateApprovalPdf,
  type ClaimExportData,
} from '../claimApprovalExport.js';

const sample: ClaimExportData = {
  title: 'DETAILS OF LATE SITTING EXPENSE',
  date_str: 'Friday , 17 July 2026',
  manager_name: 'Nirmal, Deepika T',
  client_name: 'Acme Ltd',
  submission_date: '10.09.2026',
  paid_by: [
    { name: 'Kishorekumar N', amount: 560 },
    { name: 'Kamakshi B', amount: 1000 },
  ],
  attendees: [
    { name: 'Kishorekumar N', work: 'Uniquest Financials' },
    { name: 'Kamakshi B', work: 'BHTPL - LR' },
  ],
};

describe('claimApprovalExport', () => {
  it('writes excel and pdf files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-export-'));
    const xlsx = path.join(dir, 'out.xlsx');
    const pdf = path.join(dir, 'out.pdf');
    await generateApprovalExcel(sample, xlsx);
    await generateApprovalPdf(sample, pdf);
    expect(fs.existsSync(xlsx)).toBe(true);
    expect(fs.existsSync(pdf)).toBe(true);
    expect(fs.statSync(xlsx).size).toBeGreaterThan(100);
    expect(fs.statSync(pdf).size).toBeGreaterThan(100);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
