import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/** Mirrors PATCH /api/client-queries/:id/respond body validation */
const respondSchema = z.object({
  response: z.string().min(1),
  status: z.enum(['Answered', 'Closed']).optional(),
});

describe('client query respond schema', () => {
  it('accepts a non-empty response', () => {
    const body = respondSchema.parse({ response: 'Please upload the bank statement for Q3.' });
    expect(body.response).toContain('bank statement');
  });

  it('rejects empty response', () => {
    expect(() => respondSchema.parse({ response: '' })).toThrow();
  });

  it('allows explicit Answered status', () => {
    const body = respondSchema.parse({ response: 'Noted.', status: 'Answered' });
    expect(body.status).toBe('Answered');
  });
});
