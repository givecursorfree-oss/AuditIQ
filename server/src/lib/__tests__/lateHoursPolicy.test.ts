import { describe, expect, it } from 'vitest';
import { verifyLateHoursClaim } from '../lateHoursPolicy.js';

describe('verifyLateHoursClaim', () => {
  it('flags when claimed end differs from computer log-off beyond threshold', () => {
    const v = verifyLateHoursClaim({
      actualEndTime: '22:00',
      computerLogoffTime: '20:00',
      fingerprintLogoffTime: '21:55',
    });
    expect(v.flagged).toBe(true);
    expect(v.computerMismatchMinutes).toBe(120);
  });

  it('passes when times align within threshold', () => {
    const v = verifyLateHoursClaim({
      actualEndTime: '21:00',
      computerLogoffTime: '20:45',
      fingerprintLogoffTime: '21:05',
    });
    expect(v.flagged).toBe(false);
  });
});
