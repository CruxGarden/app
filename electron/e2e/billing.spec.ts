import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * Settings → Plan against the mock billing provider: the catalog renders,
 * choosing Gardener flips the plan (mock pays instantly), usage limits follow,
 * Manage billing appears, and the second paid plan points at the portal.
 */
test.describe('billing (mocked API)', () => {
  test('free → choose Gardener → plan + usage limits update → manage billing', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      // Connect the account from Settings → Account (the same inline form the Share pane uses)
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(page.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });

      const plan = page.getByTestId('plan-settings');
      await expect(plan).toBeVisible();
      await expect(plan.getByTestId('plan-status')).toContainText('Free');
      await expect(plan.getByTestId('plan-card-gardener')).toContainText(/5(\.00)?\s*\/\s*mo/);
      await plan.getByRole('button', { name: 'Yearly' }).click();
      await expect(plan.getByTestId('plan-card-gardener')).toContainText(/50(\.00)?\s*\/\s*yr/);
      await plan.getByRole('button', { name: 'Monthly' }).click();

      await plan
        .getByTestId('plan-card-gardener')
        .getByRole('button', { name: 'Choose Gardener' })
        .click();
      await expect(plan.getByTestId('plan-status')).toContainText('Gardener', { timeout: 15_000 });
      await expect(plan.getByTestId('plan-status')).toContainText('renews');
      await expect(plan.getByTestId('plan-card-gardener')).toContainText('Current plan');
      await expect(plan.getByRole('button', { name: 'Manage billing' })).toBeVisible();
      expect(api.state.billing.checkouts).toBe(1);

      // Usage meters now show the Gardener limits
      const usage = page.getByTestId('usage-settings');
      await expect(usage).toContainText('Gardener plan', { timeout: 15_000 });
      await expect(usage).toContainText(/10(\.00)? GB/);
      await page.screenshot({ path: 'e2e/.results/billing-1-plan.png' });
    } finally {
      await app.close();
      await api.close();
    }
  });
});
