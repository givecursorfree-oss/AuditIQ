import { z } from 'zod';

/** Treat null/empty string as undefined — fixes optional form fields sent as "". */
export function emptyToUndefined(val: unknown) {
  if (val === '' || val === null) return undefined;
  return val;
}

export const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

export const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().email('Invalid email address').optional()
);
