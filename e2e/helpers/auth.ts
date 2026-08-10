import type { Page } from '@playwright/test';
import { dismissOverlays } from './audit';

export const TEST_PASSWORD = 'Admin@123';

/** MKD test accounts (seeded via npm run db:reset:force). */
export const USERS = {
  partner: { email: 'partner@mkd.co', role: 'Partner' },
  admin: { email: 'admin@mkd.co', role: 'Admin' },
  manager: { email: 'manager@mkd.co', role: 'Manager' },
  staff: { email: 'executive@mkd.co', role: 'Staff' },
  intern: { email: 'intern@mkd.co', role: 'Intern' },
  client: { email: 'client@mkd.co', role: 'Client' },
  hr: { email: 'hr@mkd.co', role: 'HR' },
  accounts: { email: 'accounts@mkd.co', role: 'Accounts' },
} as const;

const TOUR_SKIP_INIT = () => {
  localStorage.setItem(
    'auditiq:product-tour:v1',
    JSON.stringify({ version: 1, completed: true, completedSteps: [], completedAt: new Date().toISOString() })
  );
};

export async function login(page: Page, email: string) {
  await page.addInitScript(TOUR_SKIP_INIT);
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in to dashboard/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded');
  await dismissOverlays(page);
}

export async function logout(page: Page) {
  await dismissOverlays(page);
  const signOut = page.getByRole('button', { name: /sign out/i });
  if (await signOut.isVisible().catch(() => false)) {
    await signOut.click();
    const confirm = page.getByRole('button', { name: /sign out/i }).last();
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.click();
    }
    await page.waitForURL(/\/login/, { timeout: 15_000 }).catch(() => undefined);
  }
}
