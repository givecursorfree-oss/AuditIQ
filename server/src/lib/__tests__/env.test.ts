import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('loads and validates env on first getEnv without prior validateEnv', async () => {
    process.env.DATABASE_URL = 'mysql://root@localhost:3306/auditiq';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';

    const { getEnv } = await import('../env.js');
    const env = getEnv();
    expect(env.PORT).toBeTypeOf('number');
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});
