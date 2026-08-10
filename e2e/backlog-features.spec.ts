import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers/auth';

test.describe('Backlog features — visible wiring', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.partner.email);
  });

  test('engagements page exposes portfolio view entry point', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/engagements');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /engagements/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /portfolio view/i })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('sidebar links to portfolio view', async ({ page }) => {
    await page.goto('/engagements');
    await page.waitForLoadState('networkidle');

    const portfolioNav = page.getByRole('link', { name: 'Portfolio View' });
    await expect(portfolioNav).toBeVisible();
    await portfolioNav.click();
    await expect(page).toHaveURL(/\/engagements\/portfolio/);
    await expect(page.getByRole('heading', { name: /engagement portfolio/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /gst monthly returns/i })).toBeVisible();
  });

  test('portfolio view loads GST monthly returns grid', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/engagements/portfolio?service=GST_MONTHLY_RETURNS');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /engagement portfolio/i })).toBeVisible();
    await expect(page.getByText(/multi-client single-window/i)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('notices dashboard shows portal integration status', async ({ page }) => {
    await page.goto('/notices');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /notice dashboard/i })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(/portal sync/i);
  });

  test('documents page loads', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /^documents$/i })).toBeVisible();
  });

  test('create engagement modal lists GST Monthly Returns service', async ({ page }) => {
    await page.goto('/engagements');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new engagement/i }).click();
    await expect(page.getByRole('heading', { name: /new engagement/i })).toBeVisible();

    const serviceSelect = page.getByLabel(/service \(mkd catalog\)/i);
    await expect(serviceSelect).toBeVisible();
    const options = await serviceSelect.locator('option').allTextContents();
    expect(options.some((o) => /gst monthly returns/i.test(o))).toBe(true);
  });
});

test.describe('Backlog features — responsive', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.partner.email);
  });

  test('portfolio view on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/engagements/portfolio');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /engagement portfolio/i })).toBeVisible();
  });
});
