import type { Page } from 'playwright';
import type { NoticeInput, PortalCredentials, FilingStatus } from './portalSync.js';

function parseIndianDate(text: string): Date | null {
  const m = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  const d = new Date(year, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inferAdjudicationLevel(text: string): string {
  if (/show.?cause|scn/i.test(text)) return 'Show-Cause Notice';
  if (/intimation/i.test(text)) return 'Intimation';
  if (/demand/i.test(text)) return 'Demand';
  if (/order/i.test(text)) return 'Order';
  return 'Other';
}

function dedupeNotices(notices: Partial<NoticeInput>[]): Partial<NoticeInput>[] {
  const seen = new Set<string>();
  return notices.filter((n) => {
    const key = [n.referenceNumber, n.subject, n.noticeType].filter(Boolean).join('|').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function waitForPortalReady(page: Page, hints: RegExp[]): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForTimeout(2000);
  for (const hint of hints) {
    try {
      await page.waitForFunction(
        // Playwright injects this into the page; DOM typings are not in server tsconfig.
        (pattern: string) =>
          new RegExp(pattern, 'i').test((globalThis as { document?: { body?: { innerText?: string } } }).document?.body?.innerText ?? ''),
        hint.source,
        { timeout: 8000 }
      );
      return;
    } catch {
      /* try next hint */
    }
  }
}

async function extractRowNotices(
  page: Page,
  clientId: string,
  portal: string,
  rowSelector: string
): Promise<Partial<NoticeInput>[]> {
  const notices: Partial<NoticeInput>[] = [];
  const rows = page.locator(rowSelector);
  const count = await rows.count();
  for (let i = 0; i < Math.min(count, 50); i++) {
    const row = rows.nth(i);
    const text = (await row.innerText().catch(() => '')).trim();
    if (text.length < 8) continue;
    const parts = text
      .split(/\t|\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    const joined = parts.join(' ');
    notices.push({
      clientId,
      portal,
      noticeType: parts[0] || 'Notice',
      subject: parts.slice(0, 4).join(' — ').slice(0, 500),
      adjudicationLevel: inferAdjudicationLevel(joined),
      referenceNumber:
        parts.find((t) => /^(ref|arn|no\.|number|demand)/i.test(t) || /\d{5,}/.test(t)) ??
        parts[1] ??
        null,
      dateOfNotice: parseIndianDate(joined),
      dueDate: parseIndianDate(parts.find((t) => /due/i.test(t)) ?? ''),
      status: 'pending',
      rawData: { cells: parts },
    });
  }
  return notices;
}

async function extractTableNotices(
  page: Page,
  clientId: string,
  portal: string,
  tableSelector: string
): Promise<Partial<NoticeInput>[]> {
  const fromTable = await extractRowNotices(page, clientId, portal, `${tableSelector} tr`);
  if (fromTable.length) return fromTable;
  return extractRowNotices(page, clientId, portal, '[role="row"], .mat-row, .ui-datatable-data tr');
}

export async function scrapeGstPortal(
  page: Page,
  credentials: PortalCredentials
): Promise<{ notices: Partial<NoticeInput>[]; filingStatus: { GSTR_1: FilingStatus; GSTR_3B: FilingStatus } }> {
  const clientId = credentials.clientId;
  const notices: Partial<NoticeInput>[] = [];

  const noticePaths = [
    'https://services.gst.gov.in/services/auth/notices',
    'https://return.gst.gov.in/returns/auth/notices',
    'https://services.gst.gov.in/services/auth/dashboard',
  ];
  for (const url of noticePaths) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForPortalReady(page, [/notice|intimation|demand|dashboard|gst/i]);
      const body = await page.locator('body').innerText();
      if (/notice|intimation|demand|order|scn/i.test(body)) {
        notices.push(...(await extractTableNotices(page, clientId, 'GST', 'table')));
      }
    } catch {
      /* portal layout varies */
    }
  }

  let gstr1: FilingStatus = 'unknown';
  let gstr3b: FilingStatus = 'unknown';
  try {
    await page.goto('https://return.gst.gov.in/returns/auth/trackreturnstatus', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await waitForPortalReady(page, [/gstr|return|filed|status|track/i]);
    const text = await page.locator('body').innerText();
    if (/filed|success|submitted/i.test(text)) {
      if (/gstr.?1|gstr1/i.test(text)) gstr1 = 'filed';
      if (/gstr.?3b|gstr3b/i.test(text)) gstr3b = 'filed';
    }
    if (/pending|not filed|due|overdue/i.test(text)) {
      if (/gstr.?1|gstr1/i.test(text) && gstr1 === 'unknown') gstr1 = 'pending';
      if (/gstr.?3b|gstr3b/i.test(text) && gstr3b === 'unknown') gstr3b = 'pending';
      if (/overdue/i.test(text)) {
        if (/gstr.?1|gstr1/i.test(text)) gstr1 = 'overdue';
        if (/gstr.?3b|gstr3b/i.test(text)) gstr3b = 'overdue';
      }
    }
  } catch {
    /* optional filing status page */
  }

  return { notices: dedupeNotices(notices), filingStatus: { GSTR_1: gstr1, GSTR_3B: gstr3b } };
}

export async function scrapeIncomeTaxPortal(
  page: Page,
  credentials: PortalCredentials
): Promise<Partial<NoticeInput>[]> {
  const clientId = credentials.clientId;
  const notices: Partial<NoticeInput>[] = [];
  const paths = [
    'https://eportal.incometax.gov.in/iec/foservices/#/eProceedings',
    'https://eportal.incometax.gov.in/iec/foservices/#/dashboard/view-returns',
    'https://eportal.incometax.gov.in/iec/foservices/#/dashboard',
  ];
  for (const url of paths) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForPortalReady(page, [
        /notice|proceeding|demand|intimation|dashboard|itr|return/i,
      ]);
      const body = await page.locator('body').innerText();
      if (/notice|proceeding|demand|intimation|ais|26as|challan|itr/i.test(body)) {
        const fromTable = await extractTableNotices(page, clientId, 'Income_Tax', 'table');
        notices.push(...fromTable);
        if (fromTable.length === 0 && /notice|demand|intimation|proceeding/i.test(body)) {
          notices.push({
            clientId,
            portal: 'Income_Tax',
            noticeType: 'e-Proceeding',
            subject: 'Income tax portal items detected — review portal for details',
            adjudicationLevel: 'Other',
            status: 'pending',
            rawData: { snippet: body.slice(0, 800), url },
          });
        }
      }
    } catch {
      /* IT portal SPA routing varies */
    }
  }
  return dedupeNotices(notices);
}

export async function scrapeTracesPortal(
  page: Page,
  credentials: PortalCredentials
): Promise<Partial<NoticeInput>[]> {
  const clientId = credentials.clientId;
  const notices: Partial<NoticeInput>[] = [];
  const paths = [
    'https://www.tdscpc.gov.in/app/ded/notices.xhtml',
    'https://www.tdscpc.gov.in/app/ded/dashboard.xhtml',
    'https://www.tdscpc.gov.in/app/ded/view26as.xhtml',
  ];
  for (const url of paths) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForPortalReady(page, [/demand|notice|default|26as|dashboard/i]);
      notices.push(...(await extractTableNotices(page, clientId, 'TRACES', 'table')));
    } catch {
      /* path may not exist for all accounts */
    }
  }
  if (notices.length === 0) {
    try {
      const body = await page.locator('body').innerText();
      if (/demand|notice|default/i.test(body)) {
        notices.push({
          clientId,
          portal: 'TRACES',
          noticeType: 'TDS Notice',
          subject: 'TRACES portal items detected — review for outstanding demands',
          adjudicationLevel: inferAdjudicationLevel(body),
          status: 'pending',
          rawData: { snippet: body.slice(0, 800) },
        });
      }
    } catch {
      /* ignore */
    }
  }
  return dedupeNotices(notices);
}

/** Dev/test helper when live portals unavailable. */
export function mockPortalNotices(clientId: string, portal: string): Partial<NoticeInput>[] {
  return [
    {
      clientId,
      portal,
      noticeType: 'Intimation',
      subject: `[Mock] ${portal} notice — set PORTAL_SYNC_MOCK=false for live scrape`,
      adjudicationLevel: 'Intimation',
      referenceNumber: `MOCK-${portal}-${Date.now()}`,
      dueDate: new Date(Date.now() + 7 * 86400000),
      status: 'pending',
    },
  ];
}
