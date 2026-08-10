import api from '../services/api';

export type AutoLoginPortal = 'GST' | 'Income_Tax' | 'TRACES';

export interface VaultPortalEntry {
  id: string;
  clientId: string;
  portalName: string;
  username?: string;
}

const MANUAL_PORTAL_URLS: Record<string, string> = {
  GST: 'https://services.gst.gov.in/services/login',
  'Income Tax': 'https://eportal.incometax.gov.in/iec/foservices/#/login',
  IT: 'https://eportal.incometax.gov.in/iec/foservices/#/login',
  TRACES: 'https://www.tdscpc.gov.in/app/login.xhtml',
  TAN: 'https://www.tdscpc.gov.in/app/login.xhtml',
  MCA: 'https://www.mca.gov.in/content/mca/global/en/foportal/fologin.html',
  EPF: 'https://unifiedportal-emp.epfindia.gov.in',
};

export function resolveAutoLoginPortal(portalName: string): AutoLoginPortal | null {
  if (portalName === 'GST') return 'GST';
  if (portalName.toLowerCase().includes('income') || portalName === 'IT') return 'Income_Tax';
  if (portalName === 'TRACES' || portalName === 'TAN') return 'TRACES';
  return null;
}

/** Guess which government portal fits this engagement (GST return, ITR, TDS, etc.). */
export function suggestPortalName(engagementType: string): string | null {
  const t = engagementType.toLowerCase();
  if (t.includes('gst') || t.includes('gstr')) return 'GST';
  if (t.includes('tds') || t.includes('traces') || t.includes('tan')) return 'TRACES';
  if (t.includes('income') || t.includes('itr') || t.includes('tax')) return 'Income Tax';
  return null;
}

export function matchVaultEntry(
  entries: VaultPortalEntry[],
  portalName: string
): VaultPortalEntry | undefined {
  const exact = entries.find((e) => e.portalName === portalName);
  if (exact) return exact;
  const auto = resolveAutoLoginPortal(portalName);
  if (!auto) return undefined;
  return entries.find((e) => resolveAutoLoginPortal(e.portalName) === auto);
}

type PortalLoginResponse = {
  status: string;
  message?: string;
  dashboardUrl?: string;
};

export async function openVaultPortalLogin(entry: VaultPortalEntry): Promise<string> {
  const portal = resolveAutoLoginPortal(entry.portalName);
  if (!portal) {
    const url = MANUAL_PORTAL_URLS[entry.portalName];
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    try {
      const reveal = await api.get<{ password: string }>(`/vault/${entry.id}/reveal`);
      const blob = `${entry.username ?? ''}\t${reveal.data.password}`.trim();
      if (blob) await navigator.clipboard.writeText(blob);
      return url
        ? `${entry.portalName} login opened. Username and password copied to clipboard.`
        : `${entry.portalName}: username and password copied. Open the portal site manually.`;
    } catch {
      return url
        ? `${entry.portalName} login opened. Copy credentials from Password Vault.`
        : `Copy credentials for ${entry.portalName} from Password Vault.`;
    }
  }

  const r = await api.post<PortalLoginResponse>('/portals/login', {
    portal,
    clientId: entry.clientId,
    vaultEntryId: entry.id,
  });
  const data = r.data;
  if (data.status === 'logged_in' && data.dashboardUrl) {
    window.open(data.dashboardUrl, '_blank', 'noopener,noreferrer');
    return data.message || `${entry.portalName} opened.`;
  }
  if (data.status === 'captcha_required' || data.status === 'mfa_required') {
    return data.message || 'Complete captcha or OTP in the browser window.';
  }
  if (data.status === 'playwright_missing') {
    return data.message || 'Portal automation is not configured on this server.';
  }
  return data.message || `Login status: ${data.status}`;
}
