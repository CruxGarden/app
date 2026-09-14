import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
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
    const evidence = resolve(__dirname, '../../docs/included-collaboration');
    mkdirSync(evidence, { recursive: true });
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
      await expect(plan.getByTestId('plan-card-gardener')).toContainText(/10(\.00)?\s*\/\s*mo/);
      await plan.getByRole('button', { name: 'Yearly' }).click();
      await expect(plan.getByTestId('plan-card-gardener')).toContainText(/100(\.00)?\s*\/\s*yr/);
      await expect(plan.getByTestId('plan-card-gardener_plus')).toContainText(
        /200(\.00)?\s*\/\s*yr/,
      );
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
      await expect(plan.getByTestId('plan-card-gardener_plus')).toContainText(
        /20(\.00)?\s*\/\s*mo/,
      );
      const included = page.getByTestId('included-usage');
      await expect(
        included.getByRole('progressbar', { name: 'Rolling five hours used' }),
      ).toHaveAttribute('aria-valuenow', '25');
      await expect(included).toContainText('Haiku');
      await included.getByRole('button', { name: 'Use included collaborator by default' }).click();
      await expect(included).toContainText('Default set for new Collaborations');
      await included.screenshot({ path: join(evidence, 'gardener-allowance.png') });
      api.state.includedUsagePercent = 90;
      api.state.includedUncertain = 1;
      await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
      await expect(included).toContainText('nearly used');
      await expect(included).toContainText('retain a reserved allowance');
      await expect(
        included.getByRole('progressbar', { name: 'Rolling 30 days used' }),
      ).toHaveAttribute('aria-valuenow', '90');
      api.state.failIncludedUsage = true;
      await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
      await expect(included).toContainText('No allowance estimate is shown');
      await expect(included.getByRole('progressbar')).toHaveCount(0);
      await included.screenshot({ path: join(evidence, 'usage-unavailable.png') });
      api.state.failIncludedUsage = false;
      api.state.billing.planId = 'gardener_plus';
      await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
      await expect(included).toContainText('Sonnet handles requests');
      await expect(included).not.toContainText('No allowance estimate is shown');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(plan.getByTestId('plan-status')).toContainText('Gardener Plus');
      await included.screenshot({ path: join(evidence, 'plus-allowance.png') });
      await plan.screenshot({ path: join(evidence, 'plans.png') });
      await page.screenshot({ path: 'e2e/.results/billing-1-plan.png' });
    } finally {
      await app.close();
      await api.close();
    }
  });
});
