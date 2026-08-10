import type { Prisma } from '@prisma/client';
import prisma from './prisma.js';
import logger from './logger.js';
import { getEnv } from './env.js';
import { loginGovernmentPortal } from './portalAutomation.js';
import { loadPortalCredentials } from './portalCredentials.js';

export type PortalKind = 'GST' | 'Income_Tax' | 'TRACES';

export interface PortalCredentials {
  portal: PortalKind;
  clientId: string;
  username: string;
  password: string;
  gstin?: string;
  pan?: string;
  vaultEntryId?: string;
}

export type NoticeInput = {
  clientId: string;
  portal: string;
  noticeType: string;
  subject: string;
  adjudicationLevel?: string | null;
  referenceNumber?: string | null;
  dateOfNotice?: Date | null;
  dueDate?: Date | null;
  status?: string;
  engagementId?: string | null;
  rawData?: Prisma.InputJsonValue;
};

export type FilingStatus = 'filed' | 'pending' | 'overdue' | 'unknown' | 'not_configured';

/**
 * Result wrapper that distinguishes "no notices found" from "integration not
 * configured", so the UI can show integration status instead of a misleading
 * empty list.
 */
export type PortalFetchResult = {
  configured: boolean;
  notices: Partial<NoticeInput>[];
  message?: string;
};

/**
 * Pluggable government-portal provider. Real portals (GST/Income Tax/TRACES)
 * require per-account credentials + 2FA, so concrete data scraping is provided
 * by the Playwright provider where enabled; otherwise a "not configured"
 * provider returns typed status instead of silent empty arrays.
 */
export interface PortalProvider {
  readonly name: string;
  readonly configured: boolean;
  fetchGSTNotices(credentials: PortalCredentials): Promise<PortalFetchResult>;
  fetchITNotices(credentials: PortalCredentials): Promise<PortalFetchResult>;
  fetchTRACES(credentials: PortalCredentials): Promise<PortalFetchResult>;
  fetchGSTRFilingStatus(
    credentials: PortalCredentials,
    period: string
  ): Promise<{ GSTR_1: FilingStatus; GSTR_3B: FilingStatus }>;
  autoLogin(
    portal: PortalKind,
    credentials: PortalCredentials
  ): Promise<{ status: string; portal: string; message?: string; dashboardUrl?: string }>;
}

const NOT_CONFIGURED_MSG =
  'Government portal sync is not configured. Set PORTAL_SYNC_PROVIDER and store portal credentials in the vault. Notices can still be entered manually.';

/** Default provider when no integration is enabled. */
class NotConfiguredPortalProvider implements PortalProvider {
  readonly name = 'none';
  readonly configured = false;
  private notConfigured(): Promise<PortalFetchResult> {
    return Promise.resolve({ configured: false, notices: [], message: NOT_CONFIGURED_MSG });
  }
  fetchGSTNotices(): Promise<PortalFetchResult> {
    return this.notConfigured();
  }
  fetchITNotices(): Promise<PortalFetchResult> {
    return this.notConfigured();
  }
  fetchTRACES(): Promise<PortalFetchResult> {
    return this.notConfigured();
  }
  async fetchGSTRFilingStatus(): Promise<{ GSTR_1: FilingStatus; GSTR_3B: FilingStatus }> {
    return { GSTR_1: 'not_configured', GSTR_3B: 'not_configured' };
  }
  async autoLogin(portal: PortalKind) {
    return { status: 'not_configured', portal, message: NOT_CONFIGURED_MSG };
  }
}

/**
 * Browser-automation provider. Performs real portal login via Playwright; notice
 * scraping is portal/account specific, so until per-portal scrapers are added it
 * reports login status and an empty (but configured) notice set.
 *
 * ponytail: login only, no notice DOM scraping yet — add per-portal page parsers
 * here as each portal's markup is reverse-engineered.
 */
class PlaywrightPortalProvider implements PortalProvider {
  readonly name = 'playwright';
  readonly configured = true;

  private async loginAndReport(credentials: PortalCredentials): Promise<PortalFetchResult> {
    const result = await loginGovernmentPortal(credentials);
    if (result.status !== 'logged_in') {
      return { configured: true, notices: [], message: result.message ?? `Login ${result.status}` };
    }
    return { configured: true, notices: [] };
  }

  fetchGSTNotices(credentials: PortalCredentials): Promise<PortalFetchResult> {
    return this.loginAndReport(credentials);
  }
  fetchITNotices(credentials: PortalCredentials): Promise<PortalFetchResult> {
    return this.loginAndReport(credentials);
  }
  fetchTRACES(credentials: PortalCredentials): Promise<PortalFetchResult> {
    return this.loginAndReport(credentials);
  }
  async fetchGSTRFilingStatus(): Promise<{ GSTR_1: FilingStatus; GSTR_3B: FilingStatus }> {
    return { GSTR_1: 'unknown', GSTR_3B: 'unknown' };
  }
  async autoLogin(portal: PortalKind, credentials: PortalCredentials) {
    const result = await loginGovernmentPortal(credentials);
    return {
      status: result.status,
      portal: result.portal,
      message: result.message,
      dashboardUrl: result.dashboardUrl,
    };
  }
}

let _provider: PortalProvider | undefined;

export function getPortalProvider(): PortalProvider {
  if (_provider) return _provider;
  _provider =
    getEnv().PORTAL_SYNC_PROVIDER === 'playwright'
      ? new PlaywrightPortalProvider()
      : new NotConfiguredPortalProvider();
  return _provider;
}

/** Integration status for dashboards / settings. */
export function getPortalIntegrationStatus(): {
  provider: string;
  configured: boolean;
  message?: string;
} {
  const p = getPortalProvider();
  return {
    provider: p.name,
    configured: p.configured,
    message: p.configured ? undefined : NOT_CONFIGURED_MSG,
  };
}

/** Backwards-compatible facade kept for existing imports. */
export const portalSyncService = {
  fetchGSTNotices: (c: PortalCredentials) =>
    getPortalProvider().fetchGSTNotices(c).then((r) => r.notices),
  fetchITNotices: (c: PortalCredentials) =>
    getPortalProvider().fetchITNotices(c).then((r) => r.notices),
  fetchTRACES: (c: PortalCredentials) =>
    getPortalProvider().fetchTRACES(c).then((r) => r.notices),
  fetchGSTRFilingStatus: (c: PortalCredentials, period: string) =>
    getPortalProvider().fetchGSTRFilingStatus(c, period),
  autoLogin: (portal: PortalKind, c: PortalCredentials) =>
    getPortalProvider().autoLogin(portal, c),
};

export type SyncResult = { synced: number; configured: boolean; message?: string };

export async function syncClientNotices(clientId: string, firmId?: string): Promise<SyncResult> {
  const provider = getPortalProvider();
  const status = getPortalIntegrationStatus();

  const entries = await prisma.passwordVaultEntry.findMany({
    where: {
      clientId,
      portalName: { in: ['GST', 'Income Tax', 'TRACES', 'Income_Tax', 'TAN'] },
    },
  });

  if (!provider.configured) {
    return { synced: 0, configured: false, message: status.message };
  }
  if (!entries.length) {
    return {
      synced: 0,
      configured: true,
      message: 'No portal credentials in the vault for this client.',
    };
  }

  let upserted = 0;
  for (const entry of entries) {
    const portalKind: PortalKind =
      entry.portalName === 'GST'
        ? 'GST'
        : entry.portalName.includes('TRACES') || entry.portalName === 'TAN'
          ? 'TRACES'
          : 'Income_Tax';

    const credentials =
      firmId != null
        ? await loadPortalCredentials(firmId, clientId, portalKind)
        : null;

    const creds: PortalCredentials = credentials ?? {
      portal: portalKind,
      clientId,
      username: entry.username,
      password: '',
    };

    const result =
      portalKind === 'GST'
        ? await provider.fetchGSTNotices(creds)
        : portalKind === 'TRACES'
          ? await provider.fetchTRACES(creds)
          : await provider.fetchITNotices(creds);

    for (const n of result.notices) {
      if (!n.subject || !n.noticeType) continue;
      await prisma.governmentNotice.create({
        data: {
          clientId,
          portal: portalKind,
          noticeType: n.noticeType,
          adjudicationLevel: n.adjudicationLevel ?? null,
          referenceNumber: n.referenceNumber ?? null,
          dateOfNotice: n.dateOfNotice ?? null,
          dueDate: n.dueDate ?? null,
          subject: n.subject,
          status: n.status ?? 'pending',
          engagementId: n.engagementId ?? null,
          fetchedAt: new Date(),
          rawData: n.rawData ?? undefined,
        },
      });
      upserted++;
    }

    await prisma.passwordVaultEntry.update({
      where: { id: entry.id },
      data: { lastSyncedAt: new Date() },
    });
  }

  return { synced: upserted, configured: true };
}
