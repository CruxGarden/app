import { test, expect, type Page, type Route } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden } from './multi-crux-helpers';
import { showPane, chooseSettingsSection } from './panel-helpers';
import { connectAccount } from './journeys/journey-helpers';
import { openSetupWizard } from './setup-helpers';

/**
 * Customer review (October 5): CR02 composer warnings, CR03 plan allowance in
 * plain units, CR04 payment attention, and the local disk-use summary.
 *
 * Fixtures: the shared mock API (startMockApi) for sign-in, plans and usage;
 * `page.route` overlays the new contract fields the mock does not serve yet
 * (catalog `includedCollaboration`/`taxBehavior`, billing `attention`, usage
 * `nextRequest`/`byCrux`), the same way billing-recovery.spec overlays
 * billing responses. Disk use is the real desktop bridge on the isolated
 * test profile.
 */

/** Route the in-app router without reloading the shell. */
async function visit(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

const ALLOWANCE: Record<string, unknown> = {
  free: null,
  gardener: { fiveHourMicrodollars: 750_000, thirtyDayMicrodollars: 4_000_000, effort: 'medium' },
  gardener_plus: {
    fiveHourMicrodollars: 2_000_000,
    thirtyDayMicrodollars: 8_000_000,
    effort: 'high',
  },
};

/** Catalog entries gain the allowance beside `plan`; the catalog states its tax behaviour. */
async function overlayPlans(route: Route) {
  const response = await route.fetch();
  const data = await response.json();
  data.taxBehavior = 'exclusive';
  for (const entry of data.plans) entry.includedCollaboration = ALLOWANCE[entry.plan.id] ?? null;
  await route.fulfill({ response, json: data });
}

test.describe('customer review: plans, attention, composer and disk use', () => {
  test('Plans states each allowance in plain units, with tax and policy, and no self-host wording', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
    try {
      await page.route('**/billing/plans', overlayPlans);
      await enterGarden(page);
      await visit(page, '/plans');
      const gardener = page.getByTestId('plans-gardener');
      await expect(gardener).toContainText(
        '$4 of included collaboration every 30 days, up to $0.75 in any 5 hours',
        { timeout: 15_000 },
      );
      await expect(gardener).toContainText('Balanced thinking on every reply');
      await expect(page.getByTestId('plans-gardener_plus')).toContainText(
        'Deeper thinking on every reply',
      );
      await expect(page.getByTestId('plans-free')).toContainText('Collaborate with your own key');
      await expect(page.getByText('Prices plus applicable tax.')).toBeVisible();
      await expect(page.getByText(/reset on the 1st of each month \(UTC\)/)).toBeVisible();
      await expect(page.getByText(/no partial refunds/i)).toBeVisible();
      await expect(page.getByText(/Custom domains stay connected/)).toBeVisible();
      await expect(page.locator('main')).not.toContainText('enabled on your server');
      // The mock catalog has no trial days: no trial is offered.
      await expect(page.locator('main')).not.toContainText('Free trial');
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('an unpaid subscription shows why and leads to Manage billing; a refused checkout keeps the reason', async () => {
    const api = await startMockApi();
    api.state.billing = { planId: 'free', status: 'unpaid', customer: true, checkouts: 0 };
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
    try {
      await app.evaluate(({ shell }) => {
        shell.openExternal = async () => {};
      });
      await page.route('**/billing/plans', overlayPlans);
      await page.route(/\/billing\/(me|sync)$/, async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        data.attention = {
          kind: 'unpaid',
          message: 'Your last payment failed and the subscription is unpaid. Update your card.',
          action: 'portal',
        };
        data.trialEligible = false;
        await route.fulfill({ response, json: data });
      });
      await enterGarden(page);
      const settings = await showPane(page, 'Settings');
      await connectAccount(page, settings);
      await expect(settings.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
      await chooseSettingsSection(page, 'Account');
      const plan = settings.getByTestId('plan-settings');
      const attention = plan.getByTestId('plan-attention');
      await expect(attention).toContainText('subscription is unpaid', { timeout: 15_000 });
      await expect(attention.getByRole('button', { name: 'Manage billing' })).toBeVisible();
      await expect(plan.getByTestId('plan-status')).toContainText('payment needs attention');
      await expect(plan.getByTestId('plan-card-gardener')).toContainText(
        '$4 of included collaboration every 30 days',
      );
      // Window focus is quiet: no "Plan status checked." notice.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(plan.getByText('Plan status checked.')).toHaveCount(0);
      await attention.getByRole('button', { name: 'Manage billing' }).click();
      await expect(plan.getByTestId('plan-waiting')).toBeVisible();
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('the composer says when replies are shorter and when included collaboration pauses', async () => {
    const api = await startMockApi();
    api.state.billing.planId = 'gardener';
    const env = { CRUX_API_URL: api.url, CRUX_AI_MOCK: '0' };
    const { app, page } = await launchApp({ ai: false, env });
    let next = { fits: true, fullLengthFits: true };
    const contextAsked: (string | null)[] = [];
    try {
      await page.route('**/inference/usage**', async (route) => {
        contextAsked.push(new URL(route.request().url()).searchParams.get('contextTokens'));
        const response = await route.fetch();
        const data = await response.json();
        data.nextRequest = { contextTokens: 120_000, minimumMicrodollars: 60_000, ...next };
        data.byCrux = [];
        await route.fulfill({ response, json: data });
      });
      // The Setup wizard's collaborator step: signing in to the plan is the setup.
      const wizard = await openSetupWizard(page);
      await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
      await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(wizard).toHaveAttribute('data-step', 'ai');
      await connectAccount(page, page.locator('[data-setup-section="collaborator"]'));
      await expect(page.getByTestId('setup-status-collaborator')).toHaveText(
        'Included with your plan',
        { timeout: 30_000 },
      );
      await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
      await wizard.getByRole('button', { name: 'Keep the default', exact: true }).click();
      await wizard.getByRole('button', { name: 'Not now', exact: true }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByPlaceholder('My Crux').fill('Allowance check');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const status = page.getByTestId('included-status');
      await expect(status).toContainText('no API key needed', { timeout: 30_000 });
      // Remaining allowance in plain units beside the status (mock: 75 % left of $1).
      await expect(status.getByTestId('included-remaining')).toContainText('left in your');

      next = { fits: true, fullLengthFits: false };
      await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
      await expect(status).toContainText('Replies may be shorter');
      await expect(status).toHaveAttribute('data-allowance', 'shorter');

      next = { fits: false, fullLengthFits: false };
      await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
      await expect(status).toContainText('Collaboration is paused');
      await expect(status).toContainText('Your work stays here');
      await expect(status.getByRole('button', { name: 'Use your own key' })).toBeVisible();
      // The composer asks about this conversation's size, not just "anything left?".
      expect(contextAsked.some((value) => value !== null && Number(value) > 0)).toBe(true);
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('Settings shows local disk use and Clear caches reports what it freed', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const settings = await showPane(page, 'Settings');
      await chooseSettingsSection(page, 'Garden and backups');
      const disk = settings.getByTestId('disk-usage');
      await expect(disk).toContainText('Project Folders', { timeout: 30_000 });
      await expect(disk).toContainText('Blob Store');
      await expect(disk).toContainText('on this computer');
      await disk.getByRole('button', { name: 'Clear caches' }).click();
      await expect(disk.getByTestId('disk-usage-result')).toContainText(
        /Cleared .+ of caches\.|Caches were already empty\./,
        { timeout: 30_000 },
      );
    } finally {
      await app.close();
    }
  });
});
