import { describe, expect, it } from 'vitest';
import { extractReceiptTotal, isLikelyYearAmount } from '../receiptTotalExtractor.js';
import { equalShare } from '../claimGroupApproval.js';

describe('extractReceiptTotal', () => {
  it('finds grand total on labeled line', () => {
    const text = 'Item 1  450\nSubtotal  900\nGrand Total  ₹1,198.00';
    expect(extractReceiptTotal(text)).toBe(1198);
  });

  it('picks balance due over card last-4 digits', () => {
    const text = [
      'BURRITO BAR',
      'Chicken Burrito  8.79',
      'Subtotal  20.96',
      'Tax  1.15',
      'VISA 4932 #XXXXXXXXXXXX',
      'Balance Due  22.11',
    ].join('\n');
    expect(extractReceiptTotal(text)).toBe(22.11);
  });

  it('ignores card digits when no total label (decimal fallback)', () => {
    const text = 'Subtotal 20.96\nTax 1.15\nVISA 4932\n22.11';
    expect(extractReceiptTotal(text)).toBe(22.11);
  });

  it('picks grand total, not subtotal', () => {
    const text = 'Subtotal  900\nTax  50\nGrand Total  950.00';
    expect(extractReceiptTotal(text)).toBe(950);
  });

  it('reads Grand Total and common bill synonyms', () => {
    expect(extractReceiptTotal('Subtotal 100\nGrand Total ₹850.00')).toBe(850);
    expect(extractReceiptTotal('Tax 18\nBill Total 499.00')).toBe(499);
    expect(extractReceiptTotal('G.Total 320')).toBe(320);
    expect(extractReceiptTotal('Invoice Total 1,250.50')).toBe(1250.5);
    expect(extractReceiptTotal('Bill Amount 780')).toBe(780);
    expect(extractReceiptTotal('Total Payable 640.00')).toBe(640);
    expect(extractReceiptTotal('Amount Payable Rs. 910')).toBe(910);
  });

  it('prefers amount paid / to pay over MRP and discount lines', () => {
    const text = [
      'Item total  2,026.00',
      'MRP  2026',
      'Discount  -1,026.00',
      'To Pay  ₹1,000.00',
    ].join('\n');
    expect(extractReceiptTotal(text)).toBe(1000);
  });

  it('prefers you paid over grand total when both present', () => {
    const text = 'Grand Total  1,200.00\nDiscount 200\nYou Paid  1,000.00';
    expect(extractReceiptTotal(text)).toBe(1000);
  });

  it('uses net payable after discount', () => {
    const text = 'Subtotal 500\nDiscount 50\nNet Payable 450.00';
    expect(extractReceiptTotal(text)).toBe(450);
  });

  it('rejects calendar / FY documents without receipt totals', () => {
    const text = [
      'M. K. Dandeker & Co. LLP',
      'Chartered Accountants',
      'Compliance Calendar — August 2026',
      '1 Sat',
      '2 Sun',
      '3 Mon',
      '7 Fri TDS Payment',
      'FY 2025-26',
    ].join('\n');
    expect(extractReceiptTotal(text)).toBeNull();
  });

  it('does not treat year integers as amounts', () => {
    expect(isLikelyYearAmount(2026)).toBe(true);
    expect(isLikelyYearAmount(1000)).toBe(false);
    expect(extractReceiptTotal('August 2026\nTotal 518.00')).toBe(518);
  });

  it('picks labeled total when present', () => {
    const text = 'Qty 2  50\nTotal  520';
    expect(extractReceiptTotal(text)).toBe(520);
  });

  it('returns null for empty text', () => {
    expect(extractReceiptTotal('')).toBeNull();
  });
});

describe('equalShare', () => {
  it('splits evenly', () => {
    expect(equalShare(1200, 4)).toBe(300);
  });
});
