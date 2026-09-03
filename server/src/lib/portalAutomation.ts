import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import type { PortalCredentials } from './portalSync.js';

export type PortalLoginResult = {
  status: 'logged_in' | 'captcha_required' | 'mfa_required' | 'failed' | 'not_configured' | 'playwright_missing';
  portal: string;
  message: string;
  dashboardUrl?: string;
  screenshotPath?: string;
};

const PORTAL_URLS: Record<PortalCredentials['portal'], { login: string; dashboardHint: RegExp }> = {
  GST: {
    login: 'https://services.gst.gov.in/services/login',
    dashboardHint: /gst\.gov\.in\/services\/(auth|returns|dashboard)/i,
  },
  Income_Tax: {
    login: 'https://eportal.incometax.gov.in/iec/foservices/#/login',
    dashboardHint: /incometax\.gov\.in/i,
  },
  TRACES: {
    login: 'https://www.tdscpc.gov.in/app/login.xhtml',
    dashboardHint: /tdscpc\.gov\.in\/app\/(deductor|dashboard|home)/i,
  },
};

function automationEnabled(): boolean {
  return process.env.PORTAL_AUTOMATION_ENABLED !== 'false';
}

function headless(): boolean {
  return process.env.PORTAL_AUTOMATION_HEADLESS === 'true';
}

function timeoutMs(): number {
  return parseInt(process.env.PORTAL_AUTOMATION_TIMEOUT_MS || '90000', 10);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

async function fillFirst(
  page: import('playwright').Page,
  selectors: string[],
  value: string
): Promise<boolean> {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      await el.fill(value);
      return true;
    }
  }
  return false;
}

async function clickFirst(page: import('playwright').Page, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      await el.click();
      return true;
    }
  }
  return false;
}

function detectCaptcha(pageText: string): boolean {
  return /captcha|security code|enter the characters/i.test(pageText);
}

function screenshotDir(): string {
  const dir = path.join(process.cwd(), 'storage', 'portal-sessions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Playwright-based login to Indian government portals using vault credentials.
 * Captcha/MFA may require PORTAL_AUTOMATION_HEADLESS=false for manual completion.
 */
export async function loginGovernmentPortal(
  credentials: PortalCredentials
): Promise<PortalLoginResult> {
  if (!automationEnabled()) {
    return {
      status: 'not_configured',
      portal: credentials.portal,
      message: 'Portal automation disabled. Set PORTAL_AUTOMATION_ENABLED=true.',
    };
  }

  const pw = await loadPlaywright();
  if (!pw) {
    return {
      status: 'playwright_missing',
      portal: credentials.portal,
      message: 'Playwright not installed. Run: cd server && npm install && npx playwright install chromium',
    };
  }

  const cfg = PORTAL_URLS[credentials.portal];
  const browser = await pw.chromium.launch({
    headless: headless(),
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-IN',
  });
  const page = await context.newPage();

  try {
    await page.goto(cfg.login, { waitUntil: 'domcontentloaded', timeout: timeoutMs() });
    await page.waitForTimeout(1500);

    if (credentials.portal === 'GST') {
      await fillFirst(page, ['#username', 'input[name="username"]', 'input[placeholder*="Username"]'], credentials.username);
      await fillFirst(page, ['#user_pass', 'input[name="user_pass"]', 'input[type="password"]'], credentials.password);
      await clickFirst(page, ['button[type="submit"]', 'input[type="submit"]', '#loginbutton', 'button:has-text("Login")']);
    } else if (credentials.portal === 'Income_Tax') {
      await fillFirst(page, ['input#panAdhaarUserId', 'input[name="panAdhaarUserId"]', 'input[placeholder*="PAN"]'], credentials.username);
      await fillFirst(page, ['input#password', 'input[name="password"]', 'input[type="password"]'], credentials.password);
      await clickFirst(page, ['button:has-text("Continue")', 'button:has-text("Login")', 'button[type="submit"]']);
    } else {
      await fillFirst(page, ['#userId', 'input[name="userId"]', 'input[id*="user"]'], credentials.username);
      await fillFirst(page, ['#psw', 'input[name="psw"]', 'input[type="password"]'], credentials.password);
      await clickFirst(page, ['input[type="submit"]', 'button[type="submit"]', 'a:has-text("Login")']);
    }

    await page.waitForTimeout(4000);

    const bodyText = await page.locator('body').innerText().catch(() => '');
    const url = page.url();

    if (detectCaptcha(bodyText)) {
      const shot = path.join(screenshotDir(), `${credentials.portal}-${credentials.clientId}-captcha.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
      return {
        status: 'captcha_required',
        portal: credentials.portal,
        message: 'Captcha detected. Re-run with PORTAL_AUTOMATION_HEADLESS=false to solve in the browser window.',
        dashboardUrl: url,
        screenshotPath: shot,
      };
    }

    if (/otp|one.time|aadhaar.*otp|mobile.*otp/i.test(bodyText)) {
      return {
        status: 'mfa_required',
        portal: credentials.portal,
        message: 'OTP/MFA step required. Complete manually with headless=false.',
        dashboardUrl: url,
      };
    }

    if (cfg.dashboardHint.test(url) || /logout|sign out|dashboard|welcome/i.test(bodyText)) {
      const shot = path.join(screenshotDir(), `${credentials.portal}-${credentials.clientId}-dashboard.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
      return {
        status: 'logged_in',
        portal: credentials.portal,
        message: 'Login appears successful.',
        dashboardUrl: url,
        screenshotPath: shot,
      };
    }

    const shot = path.join(screenshotDir(), `${credentials.portal}-${credentials.clientId}-failed.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
    return {
      status: 'failed',
      portal: credentials.portal,
      message: 'Could not confirm dashboard after login. Check credentials or portal layout changes.',
      dashboardUrl: url,
      screenshotPath: shot,
    };
  } catch (err) {
    logger.error('Portal Playwright login error', { portal: credentials.portal, error: (err as Error).message });
    return {
      status: 'failed',
      portal: credentials.portal,
      message: (err as Error).message,
    };
  } finally {
    if (headless()) {
      await browser.close().catch(() => undefined);
    } else {
      // Keep browser open briefly for manual captcha/OTP — auto-close after timeout
      setTimeout(() => {
        void browser.close().catch(() => undefined);
      }, timeoutMs());
    }
  }
}

function sessionCookiePath(clientId: string, portal: string): string {
  return path.join(screenshotDir(), `${portal}-${clientId}-cookies.json`);
}

async function loadStoredCookies(
  context: import('playwright').BrowserContext,
  clientId: string,
  portal: string
): Promise<boolean> {
  const file = sessionCookiePath(clientId, portal);
  if (!fs.existsSync(file)) return false;
  try {
    const cookies = JSON.parse(fs.readFileSync(file, 'utf8')) as import('playwright').Cookie[];
    await context.addCookies(cookies);
    return true;
  } catch {
    return false;
  }
}

async function saveCookies(
  context: import('playwright').BrowserContext,
  clientId: string,
  portal: string
): Promise<void> {
  const cookies = await context.cookies();
  fs.writeFileSync(sessionCookiePath(clientId, portal), JSON.stringify(cookies, null, 2));
}

export type PortalSessionResult<T> = {
  status: PortalLoginResult['status'];
  portal: string;
  message?: string;
  data?: T;
};

/** Login (or reuse cookies), run scrape callback, persist session cookies. */
export async function runWithPortalSession<T>(
  credentials: PortalCredentials,
  scrape: (page: import('playwright').Page) => Promise<T>
): Promise<PortalSessionResult<T>> {
  if (!automationEnabled()) {
    return {
      status: 'not_configured',
      portal: credentials.portal,
      message: 'Portal automation disabled.',
    };
  }

  const pw = await loadPlaywright();
  if (!pw) {
    return {
      status: 'playwright_missing',
      portal: credentials.portal,
      message: 'Playwright not installed.',
    };
  }

  const cfg = PORTAL_URLS[credentials.portal];
  const browser = await pw.chromium.launch({
    headless: headless(),
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-IN' });
  await loadStoredCookies(context, credentials.clientId, credentials.portal);
  const page = await context.newPage();

  try {
    await page.goto(cfg.login, { waitUntil: 'domcontentloaded', timeout: timeoutMs() });
    await page.waitForTimeout(1500);

    let url = page.url();
    let bodyText = await page.locator('body').innerText().catch(() => '');

    if (!cfg.dashboardHint.test(url) && !/logout|sign out|dashboard/i.test(bodyText)) {
      if (credentials.portal === 'GST') {
        await fillFirst(page, ['#username', 'input[name="username"]'], credentials.username);
        await fillFirst(page, ['#user_pass', 'input[type="password"]'], credentials.password);
        await clickFirst(page, ['button[type="submit"]', '#loginbutton']);
      } else if (credentials.portal === 'Income_Tax') {
        await fillFirst(page, ['input#panAdhaarUserId', 'input[name="panAdhaarUserId"]'], credentials.username);
        await fillFirst(page, ['input#password', 'input[type="password"]'], credentials.password);
        await clickFirst(page, ['button:has-text("Continue")', 'button[type="submit"]']);
      } else {
        await fillFirst(page, ['#userId', 'input[name="userId"]'], credentials.username);
        await fillFirst(page, ['#psw', 'input[type="password"]'], credentials.password);
        await clickFirst(page, ['input[type="submit"]', 'button[type="submit"]']);
      }
      await page.waitForTimeout(4000);
      url = page.url();
      bodyText = await page.locator('body').innerText().catch(() => '');
    }

    if (detectCaptcha(bodyText)) {
      return { status: 'captcha_required', portal: credentials.portal, message: 'Captcha required.' };
    }
    if (/otp|one.time|aadhaar.*otp/i.test(bodyText)) {
      return { status: 'mfa_required', portal: credentials.portal, message: 'OTP required.' };
    }
    if (!cfg.dashboardHint.test(url) && !/logout|sign out|dashboard|welcome/i.test(bodyText)) {
      return { status: 'failed', portal: credentials.portal, message: 'Login not confirmed.' };
    }

    await saveCookies(context, credentials.clientId, credentials.portal);
    const data = await scrape(page);
    return { status: 'logged_in', portal: credentials.portal, message: 'Scrape complete.', data };
  } catch (err) {
    logger.error('Portal session scrape error', { portal: credentials.portal, error: (err as Error).message });
    return { status: 'failed', portal: credentials.portal, message: (err as Error).message };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
