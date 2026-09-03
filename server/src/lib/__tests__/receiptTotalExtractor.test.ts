import { describe, expect, it } from 'vitest';
import { extractReceiptTotal } from '../receiptTotalExtractor.js';
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

  it('picks largest labeled total, not subtotal', () => {
    const text = 'Subtotal  900\nTax  50\nGrand Total  950.00';
    expect(extractReceiptTotal(text)).toBe(950);
  });

  it('picks largest amount when no label', () => {
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
