import { describe, expect, it } from 'vitest';
import { claimEvidenceLines } from '../../../../client/src/lib/expenseClaims.ts';

describe('claimEvidenceLines', () => {
  it('marks each source independently against 7:00 PM', () => {
    const [app, thumb] = claimEvidenceLines({
      computerLogoffTime: '20:15',
      fingerprintLogoffTime: '18:45',
    });
    expect(app).toMatchObject({ value: '8:15 PM', mark: '✓', tone: 'success' });
    expect(thumb).toMatchObject({ value: '6:45 PM', mark: '⚠', tone: 'warning' });
  });

  it('treats 7:00 PM as not after the threshold', () => {
    const [app] = claimEvidenceLines({ computerLogoffTime: '19:00', fingerprintLogoffTime: '19:01' });
    expect(app.tone).toBe('warning');
    expect(claimEvidenceLines({ computerLogoffTime: '19:01' })[0].tone).toBe('success');
  });

  it('uses neutral copy when a source is missing and error copy when the time is malformed', () => {
    const [app, thumb] = claimEvidenceLines({ computerLogoffTime: 'nope', fingerprintLogoffTime: null });
    expect(app).toMatchObject({ value: 'Unable to read', tone: 'error' });
    expect(thumb).toMatchObject({ value: 'Not available', tone: 'muted', mark: '' });
    expect(claimEvidenceLines(null)[0]).toMatchObject({ value: 'Not recorded', tone: 'muted' });
  });
});
