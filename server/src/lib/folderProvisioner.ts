import fs from 'fs/promises';
import path from 'path';
import { getEnv } from './env.js';
import logger from './logger.js';

const STANDARD_SUBFOLDERS = ['Audit', 'GST', 'Income Tax', 'Correspondence'] as const;

function safeSlug(name: string): string {
  // Allow letters, digits, spaces, hyphens, ampersand; strip everything else.
  return name.replace(/[^a-zA-Z0-9 &-]/g, '').replace(/\s+/g, ' ').trim() || 'Client';
}

/**
 * Creates the standard folder layout for a client and returns the absolute root path.
 *   <storageRoot>/<ClientName>/<Year>/{Audit,GST,Income Tax,Correspondence}
 *
 * Idempotent: existing folders are left untouched.
 */
export async function provisionClientFolders(
  clientName: string,
  year: string | number = new Date().getFullYear()
): Promise<string> {
  const root = getEnv().CLIENT_STORAGE_ROOT;
  const clientFolder = path.resolve(root, safeSlug(clientName), String(year));

  await fs.mkdir(clientFolder, { recursive: true });
  for (const sub of STANDARD_SUBFOLDERS) {
    await fs.mkdir(path.join(clientFolder, sub), { recursive: true });
  }

  logger.info('Provisioned client folder structure', { clientName, year, path: clientFolder });
  return clientFolder;
}

export function listStandardSubfolders(): readonly string[] {
  return STANDARD_SUBFOLDERS;
}
