import { Response } from 'express';
import logger from '../lib/logger.js';
import { UseCaseError } from './errors.js';

export function handleUseCaseError(
  err: unknown,
  res: Response,
  context: string,
  fallbackMessage: string
): boolean {
  if (err instanceof UseCaseError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return true;
  }
  logger.error(context, { error: (err as Error).message });
  res.status(500).json({ error: fallbackMessage });
  return true;
}
