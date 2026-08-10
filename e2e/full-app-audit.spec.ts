import { test, expect } from '@playwright/test';
import { login, USERS, logout } from './helpers/auth';
import { auditRoute, type AuditIssue, summarizeIssues } from './helpers/audit';

const PARTNER_ROUTES = [
  '/',
  '/engagements/workflow',
  '/workflow',
  '/services',
  '/engagements',
  '/engagements/portfolio',
  '/clients',
  '/requests',
  '/document-library',
  '/admin/scheduler',
  '/compliance-calendar',
  '/timesheets',
  '/billing/pending',
  '/claims/pending',
  '/notices',
  '/workpapers',
  '/documents',
  '/approvals',
  '/time-tracker',
  '/attendance',
  '/leave-stipend?tab=apply',
  '/leave-stipend?tab=inbox',
  '/employees',
  '/messages',
  '/reports',
  '/billing',
  '/management-reports',
  '/vault',
  '/settings',
  '/settings?tab=roles',
];

const ADMIN_ROUTES = [
  '/',
  '/leave-stipend?tab=inbox',
  '/settings',
  '/settings?tab=roles',
  '/clients',
  '/documents',
];

const CLIENT_ROUTES = ['/client/dashboard', '/client/messages'];

const PUBLIC_ROUTES = ['/login', '/register', '/verify-email'];

const SMOKE = { clickButtons: false } as const;

test.describe('Full application audit', () => {
  test('login page dead links', async ({ page }) => {
    const deadLinks = [
      '/forgot-password',
      '/privacy-policy',
      '/terms-of-service',
      '/security-compliance',
    ];
    const broken: string[] = [];
    for (const path of deadLinks) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      const pathname = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
      const expected = path.replace(/\/$/, '') || '/';
      if (pathname !== expected) {
        broken.push(`${path} → redirects to ${pathname}`);
      }
    }
    if (broken.length) {
      console.log('\n========== DEAD LINKS ==========');
      broken.forEach((b) => console.log(`  ${b}`));
    }
    expect(broken, broken.join('\n')).toHaveLength(0);
  });

  test('public pages load', async ({ page }) => {
    const issues: AuditIssue[] = [];
    for (const route of PUBLIC_ROUTES) {
      await auditRoute(page, route, issues, SMOKE);
      expect(page.url()).toContain(route === '/login' ? '/login' : route.replace(/^\//, ''));
    }
    printReport('Public', issues);
  });

  test('partner — all pages and buttons', async ({ page }) => {
    const issues: AuditIssue[] = [];
    await login(page, USERS.partner.email);

    let engagementId: string | null = null;
    try {
      const res = await page.request.get('/api/engagements');
      if (res.ok()) {
        const data = (await res.json()) as { id: string }[];
        engagementId = data[0]?.id ?? null;
      }
    } catch {
      /* ignore */
    }

    const routes = [...PARTNER_ROUTES];
    if (engagementId) {
      routes.push(`/engagements/${engagementId}`);
      routes.push(`/engagements/${engagementId}/letter`);
    }

    for (const route of routes) {
      await auditRoute(page, route, issues, SMOKE);
    }

    printReport('Partner', issues);
    const critical = issues.filter(
      (i) =>
        i.kind === 'network' ||
        i.kind === 'ui' ||
        (i.kind === 'navigation' && i.detail.includes('unauthorized'))
    );
    expect(critical, formatFailures(critical)).toHaveLength(0);
  });

  test('admin — leave inbox and settings', async ({ page }) => {
    const issues: AuditIssue[] = [];
    await login(page, USERS.admin.email);

    for (const route of ADMIN_ROUTES) {
      await auditRoute(page, route, issues, SMOKE);
    }

    printReport('Admin', issues);
    const critical = issues.filter(
      (i) =>
        i.kind === 'network' ||
        i.kind === 'ui' ||
        (i.kind === 'navigation' && i.detail.includes('unauthorized'))
    );
    expect(critical, formatFailures(critical)).toHaveLength(0);

    await page.goto('/leave-stipend?tab=apply');
    await page.waitForLoadState('domcontentloaded');
    const applyTab = page.getByRole('button', { name: /apply for leave/i });
    expect(await applyTab.isVisible().catch(() => false)).toBe(false);
  });

  test('client portal pages', async ({ page }) => {
    const issues: AuditIssue[] = [];
    await login(page, USERS.client.email);

    for (const route of CLIENT_ROUTES) {
      await auditRoute(page, route, issues, SMOKE);
    }

    printReport('Client', issues);
    const critical = issues.filter(
      (i) =>
        i.kind === 'network' ||
        i.kind === 'ui' ||
        (i.kind === 'navigation' && i.detail.includes('unauthorized'))
    );
    expect(critical, formatFailures(critical)).toHaveLength(0);
    expect(page.url()).not.toContain('/unauthorized');
  });

  test('staff and intern sidebar smoke', async ({ page }) => {
    for (const key of ['staff', 'intern'] as const) {
      const issues: AuditIssue[] = [];
      await login(page, USERS[key].email);
      await auditRoute(page, '/', issues, SMOKE);
      await auditRoute(
        page,
        key === 'intern' ? '/leave-stipend?tab=stipend' : '/leave-stipend?tab=apply',
        issues,
        SMOKE
      );
      await auditRoute(page, '/documents', issues, SMOKE);
      printReport(key, issues);
      const critical = issues.filter(
        (i) =>
          i.kind === 'network' ||
          i.kind === 'ui' ||
          (i.kind === 'navigation' && i.detail.includes('unauthorized'))
      );
      expect(critical, formatFailures(critical)).toHaveLength(0);
      await logout(page);
    }
  });
});

function printReport(role: string, issues: AuditIssue[]) {
  const grouped = summarizeIssues(issues);
  console.log(`\n========== ${role.toUpperCase()} AUDIT (${issues.length} issues) ==========`);
  if (issues.length === 0) {
    console.log('No issues detected.');
    return;
  }
  for (const [route, list] of grouped) {
    console.log(`\n[${route}]`);
    for (const i of list) {
      console.log(`  ${i.kind}: ${i.detail}`);
    }
  }
}

function formatFailures(issues: AuditIssue[]) {
  return issues.map((i) => `${i.route} → ${i.detail}`).join('\n');
}
