import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  default: {
    attendance: { findFirst: mocks.findFirst, update: mocks.update, create: vi.fn() },
    staffWorkStatus: { upsert: vi.fn() },
  },
}));

import { syncAttendanceActivity } from '../staffWorkStatus.js';

describe('staffWorkStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncAttendanceActivity returns null when no attendance record for today', async () => {
    mocks.findFirst.mockResolvedValue(null);
    const result = await syncAttendanceActivity('user-1', 60, 30);
    expect(result).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('syncAttendanceActivity increments active and away seconds', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'att-1' });
    mocks.update.mockResolvedValue({ id: 'att-1', totalActiveSeconds: 60 });
    await syncAttendanceActivity('user-1', 45, 15);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'att-1' },
      data: {
        totalActiveSeconds: { increment: 45 },
        totalAwaySeconds: { increment: 15 },
      },
    });
  });
});
