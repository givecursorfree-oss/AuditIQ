import type { Page, ConsoleMessage, Response } from '@playwright/test';

export type AuditIssue = {
  kind: 'console' | 'network' | 'ui' | 'navigation' | 'click';
  route: string;
  detail: string;
};

const SKIP_BUTTON =
  /sign out|logout|delete|remove|trash|reject|discard|cancel subscription|clear database|notification|expand sidebar|collapse sidebar|product guide|guide complete|share|toggle theme|google drive|^available$|^×$|enter portal|got it|highlight features/i;

const TOUR_SKIP_STORAGE = JSON.stringify({
  version: 1,
  completed: true,
  completedSteps: [],
  completedAt: new Date().toISOString(),
});

export type AuditRouteOptions = {
  maxClicks?: number;
  clickButtons?: boolean;
};

export function attachAuditors(page: Page, route: string, issues: AuditIssue[]) {
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/favicon|ResizeObserver|chunk|devtools|401.*auth\/me/i.test(text)) return;
    issues.push({ kind: 'console', route, detail: text.slice(0, 500) });
  };

  const onResponse = (res: Response) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    const status = res.status();
    if (status === 401 && url.includes('/api/auth/me')) return;
    if (status === 404 && url.includes('/api/attendance/me/today')) return;
    if (status >= 400) {
      issues.push({ kind: 'network', route, detail: `${status} ${res.request().method()} ${url}` });
    }
  };

  page.on('console', onConsole);
  page.on('response', onResponse);

  return () => {
    page.off('console', onConsole);
    page.off('response', onResponse);
  };
}

export async function dismissOverlays(page: Page) {
  await page.evaluate((storage) => {
    localStorage.setItem('auditiq:product-tour:v1', storage);
  }, TOUR_SKIP_STORAGE);

  const dismissSelectors = [
    page.getByRole('button', { name: /enter portal|get started|continue|close guide/i }),
    page.getByRole('button', { name: /^×$/ }),
    page.locator('[data-tour-fab]'),
  ];

  for (const locator of dismissSelectors) {
    if (await locator.first().isVisible({ timeout: 400 }).catch(() => false)) {
      await locator.first().click({ timeout: 1000 }).catch(() => undefined);
    }
  }

  await page.keyboard.press('Escape').catch(() => undefined);
}

export async function waitForPageReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  const spinner = page.locator('.animate-spin').first();
  if (await spinner.isVisible().catch(() => false)) {
    await spinner.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  }
}

export async function auditRoute(
  page: Page,
  path: string,
  issues: AuditIssue[],
  options: AuditRouteOptions = {}
) {
  const { maxClicks = 6, clickButtons = true } = options;
  const detach = attachAuditors(page, path, issues);
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await waitForPageReady(page);
    await dismissOverlays(page);

    if (await page.getByText('Something went wrong').isVisible().catch(() => false)) {
      issues.push({ kind: 'ui', route: path, detail: 'Error boundary: Something went wrong' });
    }
    if (await page.getByText('Access Restricted').isVisible().catch(() => false)) {
      issues.push({ kind: 'ui', route: path, detail: 'Access Restricted panel shown' });
    }
    if (page.url().includes('/unauthorized')) {
      issues.push({ kind: 'navigation', route: path, detail: 'Redirected to /unauthorized' });
      return;
    }

    if (clickButtons) {
      await clickSafeButtons(page, path, issues, maxClicks);
    }
  } catch (err) {
    issues.push({ kind: 'navigation', route: path, detail: `Navigation failed: ${(err as Error).message}` });
  } finally {
    detach();
  }
}

async function dismissDialogs(page: Page) {
  const ok = page.getByRole('button', { name: /^(ok|close|cancel|stay signed in|got it|dismiss)$/i });
  if (await ok.first().isVisible({ timeout: 400 }).catch(() => false)) {
    await ok.first().click().catch(() => undefined);
  }
}

export async function clickSafeButtons(
  page: Page,
  route: string,
  issues: AuditIssue[],
  maxClicks = 6
) {
  let locator = page.locator('main button:visible');
  let count = await locator.count();
  if (count === 0) {
    locator = page.locator('button:visible');
    count = await locator.count();
  }
  const clicked = new Set<string>();
  let clicks = 0;

  for (let i = 0; i < count && clicks < maxClicks; i++) {
    const btn = locator.nth(i);
    const inChrome = await btn
      .evaluate((el) => Boolean(el.closest('[data-sidebar], [data-tour-fab], .fixed.bottom-20, .fixed.bottom-6')))
      .catch(() => false);
    if (inChrome) continue;
    const label = (
      (await btn.innerText().catch(() => '')) ||
      (await btn.getAttribute('aria-label')) ||
      `btn-${i}`
    ).trim();
    if (!label || SKIP_BUTTON.test(label)) continue;
    if (clicked.has(label)) continue;
    clicked.add(label);

    try {
      if (!(await btn.isEnabled())) continue;
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ timeout: 1500 });
      clicks += 1;
      await page.waitForTimeout(200);
      await dismissDialogs(page);
      await dismissOverlays(page);
    } catch (err) {
      issues.push({ kind: 'click', route, detail: `Button "${label}": ${(err as Error).message.slice(0, 120)}` });
    }
  }
}

export function summarizeIssues(issues: AuditIssue[]) {
  const byRoute = new Map<string, AuditIssue[]>();
  for (const issue of issues) {
    const list = byRoute.get(issue.route) ?? [];
    list.push(issue);
    byRoute.set(issue.route, list);
  }
  return byRoute;
}
