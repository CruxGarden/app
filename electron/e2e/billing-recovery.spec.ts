import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/** External-payment UI without opening a real provider or charging a card.
 * PostgreSQL delivery semantics live in the API integration suite.
 */
test('billing return recovery: unavailable prices, timeout, retry, interval and grace', async ({}, info) => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
  let pending = false;
  let resumed = 0;
  let interval = 'month';
  let unavailable = false;
  let healthUnavailable = false;
  let operator = true;
  let reconciles = 0;
  let graceEndsAt: string | null = null;
  try {
    await app.evaluate(({ shell }) => {
      shell.openExternal = async () => {};
    });
    await page.route('**/billing/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/operations/reconcile')) {
        reconciles++;
        await route.fulfill({ json: { status: 'verified' } });
        return;
      }
      if (path.endsWith('/operations')) {
        await route.fulfill(
          healthUnavailable
            ? { status: 503, json: { message: 'Fixture database unavailable' } }
            : {
                json: {
                  provider: 'stripe',
                  emailDelivery: 'logging',
                  scheduler: { enabled: true, running: false, lastRun: null, lastRunFailed: false },
                  prices: { available: true, missing: [] },
                  counters: {
                    failed: 1,
                    stale: 2,
                    unchecked: 3,
                    due: 1,
                    webhookFailures: 1,
                    pendingCheckouts: 0,
                    ambiguousCheckouts: 0,
                    closingAccounts: 0,
                    pendingNotifications: 2,
                    failedNotifications: 1,
                    latestCompletedWebhook: null,
                  },
                  problems: { accounts: [], deliveries: [], checkouts: [] },
                },
              },
        );
        return;
      }
      if (path.endsWith('/checkout/resume')) {
        resumed++;
        await route.fulfill({ json: { url: 'https://checkout.stripe.com/isolated-fixture' } });
        return;
      }
      if (path.endsWith('/checkout/cancel')) {
        pending = false;
        const response = await route.fetch({ url: api.url + '/billing/sync' });
        const data = await response.json();
        await route.fulfill({ response, json: { ...data, graceEndsAt, pendingCheckout: false } });
        return;
      }
      if (path.endsWith('/checkout')) {
        pending = true;
        await route.fulfill({ json: { url: 'https://checkout.stripe.com/isolated-fixture' } });
        return;
      }
      if (path.endsWith('/sync') && unavailable) {
        await route.fulfill({ status: 503, json: { message: 'Fixture temporarily unavailable' } });
        return;
      }
      const response = await route.fetch();
      const data = await response.json();
      if (path.endsWith('/plans')) {
        data.instant = false;
        for (const entry of data.plans)
          entry.prices = entry.prices.filter((p: { interval: string }) => p.interval === 'month');
      }
      if (path.endsWith('/me') || path.endsWith('/sync')) {
        data.canMonitor = operator;
        data.pendingCheckout = pending;
        data.interval = interval;
        data.graceEndsAt = graceEndsAt;
      }
      await route.fulfill({ response, json: data });
    });
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByText('Plant a new garden').click();
    await page.getByRole('button', { name: 'Welcome' }).click();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    const plan = page.getByTestId('plan-settings');
    await expect(plan.getByTestId('plan-status')).toContainText('Free');
    await plan.getByRole('button', { name: 'Yearly' }).click();
    const gardener = plan.getByTestId('plan-card-gardener');
    await expect(gardener).toContainText('Unavailable');
    await expect(gardener.getByRole('button', { name: 'Choose Gardener' })).toBeDisabled();
    await plan.getByRole('button', { name: 'Monthly' }).click();
    await page.clock.install();
    await gardener.getByRole('button', { name: 'Choose Gardener' }).click();
    await expect(plan.getByTestId('plan-waiting')).toBeVisible();
    await page.clock.fastForward(320_000);
    await expect(plan).toContainText('No plan change confirmed yet');
    await expect(plan.getByTestId('pending-checkout')).toBeVisible();
    await plan.getByRole('button', { name: 'Resume checkout', exact: true }).click();
    await expect(plan.getByTestId('plan-waiting')).toBeVisible();
    expect(resumed).toBe(1);
    await plan.getByRole('button', { name: 'Cancel pending checkout' }).click();
    await expect(plan.getByTestId('pending-checkout')).toHaveCount(0);
    await expect(plan.getByTestId('plan-waiting')).toHaveCount(0);
    await expect(plan).toContainText('Pending checkout canceled');
    unavailable = true;
    await plan.getByRole('button', { name: 'Check again' }).click();
    await expect(plan.getByRole('alert')).toContainText('Could not verify your plan');
    unavailable = false;
    pending = false;
    api.state.billing.planId = 'gardener';
    api.state.billing.status = 'active';
    api.state.billing.customer = true;
    await plan.getByRole('button', { name: 'Check again' }).click();
    await expect(plan.getByTestId('plan-status')).toContainText('Gardener');
    await expect(page.getByTestId('usage-settings')).toContainText('Gardener plan');
    await expect(plan.getByRole('alert')).toHaveCount(0);
    await plan.getByRole('button', { name: 'Manage billing' }).click();
    await expect(plan.getByTestId('plan-waiting')).toBeVisible();
    interval = 'year';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(plan.getByTestId('plan-waiting')).toHaveCount(0);
    api.state.billing.status = 'past_due';
    graceEndsAt = '2030-01-01T00:00:00Z';
    await plan.getByRole('button', { name: 'Check again' }).click();
    await expect(plan).toContainText('Paid benefits remain until');
    api.state.billing.planId = 'free';
    graceEndsAt = '2020-01-01T00:00:00Z';
    await plan.getByRole('button', { name: 'Check again' }).click();
    await expect(plan).toContainText('Paid benefits are paused');
    await expect(plan.getByRole('button', { name: 'Choose Gardener', exact: true })).toHaveCount(0);
    await expect(plan.getByRole('button', { name: 'Manage billing' })).toBeVisible();
    const health = plan.getByTestId('billing-health');
    await health.getByText('Billing health · operator').click();
    await health.getByRole('button', { name: 'Refresh billing health' }).click();
    await expect(health).toContainText('logging only — delivery unconfigured');
    await expect(health.getByText('Failed account checks').locator('..')).toContainText('1');
    await health.getByRole('button', { name: 'Reconcile my account' }).click();
    await expect(health).toContainText('Provider state verified.');
    expect(reconciles).toBe(1);
    healthUnavailable = true;
    await health.getByRole('button', { name: 'Refresh billing health' }).click();
    await expect(health.getByRole('alert')).toContainText('previous snapshot may be out of date');
    healthUnavailable = false;
    await health.getByRole('button', { name: 'Refresh billing health' }).click();
    await expect(health.getByRole('alert')).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .setLegacyMode()
          .include('[data-testid="plan-settings"]')
          .analyze()
      ).violations,
    ).toEqual([]);
    await health.screenshot({ path: info.outputPath('billing-health.png') });
    operator = false;
    await plan.getByRole('button', { name: 'Check again', exact: true }).click();
    await expect(plan.getByTestId('billing-health')).toHaveCount(0);
    await plan.screenshot({ path: info.outputPath('billing-recovery.png') });
  } finally {
    await app.close();
    await api.close();
  }
});
