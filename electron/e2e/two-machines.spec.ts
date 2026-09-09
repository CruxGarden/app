import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * RESILIENCE-PLAN §3 scenarios 6, 7 and 8: a pull never quietly overwrites
 * newer work here; a second account on an existing garden is a question, not
 * a slide; the plan's storage standing is said before a push fails on it.
 */
test.describe('two machines, two accounts (mocked API)', () => {
  test.setTimeout(180_000);

  test('pull refusals name the newer work; a different account asks; storage standing is shown', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>One</h1>');
      await page.keyboard.press('ControlOrMeta+s');

      // Share and back up (the archive is this machine's push)
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Back up and share' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(() => api.log.filter((l) => l.startsWith('PUT /sync/crux/')).length, {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);

      // Scenario 6 (crux): change here, then Pull → the dialog says so and offers "Pull anyway"
      await page.waitForTimeout(1_500); // past the clock-skew slack
      await monaco.click();
      await page.keyboard.type('<p>two</p>');
      await page.keyboard.press('ControlOrMeta+s');
      await page.getByRole('button', { name: 'Toggle sync' }).click();
      await page.getByRole('button', { name: 'Pull from cloud' }).click();
      const pullAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'changed here after its last push' });
      await expect(pullAsk).toBeVisible();
      await expect(pullAsk.getByRole('button', { name: 'Pull anyway' })).toBeVisible();
      await pullAsk.getByRole('button', { name: 'Cancel' }).click();
      expect(api.log.some((l) => l.startsWith('GET /sync/crux/'))).toBe(false);

      // Scenario 8: the plan's storage standing, when it matters
      api.state.storageUsedBytes = Math.round(1073741824 * 0.9);
      await page.getByRole('button', { name: 'Toggle sync' }).click();
      await page.getByRole('button', { name: 'Toggle sync' }).click();
      await expect(page.getByTestId('sync-budget')).toContainText('90%', { timeout: 15_000 });
      api.state.storageUsedBytes = 0;
      // five panes leave the Workshop too narrow to edit in: close Share and Sync
      await page.getByRole('button', { name: 'Toggle sync' }).click();
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await expect(monaco).toBeVisible({ timeout: 15_000 });

      // Scenario 6 (garden): push the garden, change a crux, Pull garden → named refusal
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await page.locator('h2', { hasText: /^Sync$/ }).click();
      await page.getByRole('button', { name: 'Push garden' }).click();
      await expect(page.getByText(/Garden pushed successfully/)).toBeVisible({ timeout: 60_000 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(6_000); // the refusal ignores changes within five seconds of the push
      await monaco.click();
      await page.keyboard.type('<p>three</p>');
      await page.keyboard.press('ControlOrMeta+s');
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await page.locator('h2', { hasText: /^Sync$/ }).click();
      await page.getByRole('button', { name: 'Pull garden' }).click();
      const gardenAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'changed here after the cloud backup' });
      await expect(gardenAsk).toBeVisible({ timeout: 15_000 });
      await expect(gardenAsk).toContainText('My Crux');
      await gardenAsk.getByRole('button', { name: 'Cancel' }).click();
      await page.keyboard.press('Escape');

      // Scenario 7: log out, sign in as another account → the question; Stay leaves it disconnected
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: 'Log out' }).click();
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await page.getByPlaceholder('email@example.com').fill('other@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const acctAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'You signed in as other@example.com' });
      await expect(acctAsk).toBeVisible({ timeout: 30_000 });
      await acctAsk.getByRole('button', { name: 'Stay disconnected' }).click();
      await expect(page.getByText(/belongs to a different account/)).toBeVisible();
      // …and Switch connects it (the form kept the email and code)
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(acctAsk).toBeVisible({ timeout: 30_000 });
      await acctAsk.getByRole('button', { name: 'Switch this garden' }).click();
      await expect(page.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await app.close();
    }
  });
});
