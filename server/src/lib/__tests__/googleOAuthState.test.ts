import { describe, it, expect, beforeAll } from 'vitest';
import { createGoogleOAuthState, verifyGoogleOAuthState } from '../googleOAuthState.js';

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';
  process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long';
});

describe('googleOAuthState', () => {
  it('creates and verifies a valid state', () => {
    const state = createGoogleOAuthState('user-1', 'firm-1');
    const parsed = verifyGoogleOAuthState(state);
    expect(parsed).toEqual({ userId: 'user-1', firmId: 'firm-1' });
  });

  it('rejects tampered state', () => {
    const state = createGoogleOAuthState('user-1', 'firm-1');
    const tampered = state.replace(/.$/, state.endsWith('a') ? 'b' : 'a');
    expect(verifyGoogleOAuthState(tampered)).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(verifyGoogleOAuthState('not-valid')).toBeNull();
  });
});
