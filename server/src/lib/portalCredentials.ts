import prisma from './prisma.js';
import { decryptSecret } from './vaultCrypto.js';
import type { PortalCredentials } from './portalSync.js';

export type PortalKind = 'GST' | 'Income_Tax' | 'TRACES';

const PORTAL_NAME_MAP: Record<PortalKind, string[]> = {
  GST: ['GST'],
  Income_Tax: ['Income Tax', 'Income_Tax', 'IT'],
  TRACES: ['TRACES', 'TAN'],
};

export function normalizePortalKind(portalName: string): PortalKind | null {
  const n = portalName.trim().toLowerCase();
  if (n === 'gst') return 'GST';
  if (n.includes('income') || n === 'it') return 'Income_Tax';
  if (n.includes('traces') || n === 'tan') return 'TRACES';
  return null;
}

/** Load decrypted vault credentials for a client portal (server-side only). */
export async function loadPortalCredentials(
  firmId: string,
  clientId: string,
  portal: PortalKind
): Promise<PortalCredentials | null> {
  const names = PORTAL_NAME_MAP[portal];
  const entry = await prisma.passwordVaultEntry.findFirst({
    where: {
      clientId,
      client: { firmId },
      portalName: { in: names },
    },
    include: { client: { select: { gstin: true, pan: true } } },
  });
  if (!entry) return null;

  let password: string;
  try {
    password = decryptSecret(entry.passwordEnc);
  } catch {
    return null;
  }

  return {
    portal,
    clientId,
    username: entry.username,
    password,
    gstin: entry.client.gstin ?? undefined,
    pan: entry.client.pan ?? undefined,
    vaultEntryId: entry.id,
  };
}
