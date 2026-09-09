import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * Screenshots of every major screen, for the UI polish pass. Not assertions of
 * behaviour — a fixed tour that lands the same frames each run so before/after
 * can be compared by eye. Output: e2e/.results/polish/NN-<screen>.png
 * Run alone: npx playwright test e2e/polish-shots.spec.ts
 */
const OUT = (name: string) => `e2e/.results/polish/${name}.png`;

async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false)))
    await page.getByRole('button', { name: toggle }).click();
  await expect(body).toBeVisible({ timeout: 30_000 });
}
async function closePane(page: Page, label: string) {
  const btn = page.getByTitle(`Close ${label}`);
  if (await btn.isVisible().catch(() => false)) await btn.click();
}
async function shot(page: Page, name: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT(name) });
}

test.describe('polish tour', () => {
  test.setTimeout(300_000);

  test('every screen, once', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      // Gateway: wait for the banner to be in place
      await expect(page.getByRole('button', { name: /enter/i })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(3500); // curtain + entrance
      await shot(page, '01-gateway');
      await enterGarden(page);
      await shot(page, '02-home-empty');

      // Builder with a file and a conversation
      await createCrux(page, 'Solar Notes');
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>Solar Notes</h1>\n<p>A small page about the sun.</p>');
      await page.keyboard.press('ControlOrMeta+s');
      await ensurePane(page, 'collaboration', 'Toggle collaboration');
      await shot(page, '03-builder-default');

      // Settings (before connecting) — every section
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await shot(page, '04-settings');
      await page.locator('h2', { hasText: /^AI$/ }).click();
      await shot(page, '05-settings-ai');
      await page.locator('h2', { hasText: /^Garden$/ }).click();
      await shot(page, '06-settings-garden');
      await page.keyboard.press('Escape');

      // Share pane → connect → publish (with the backup prompt)
      await ensurePane(page, 'publish', 'Toggle share');
      await shot(page, '07-share-disconnected');
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await shot(page, '08-connect-code');
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await shot(page, '09-dialog-choice');
      await ask.getByRole('button', { name: 'Back up and share' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      await shot(page, '10-share-published');

      // Each remaining pane, one at a time beside Collaboration + Artifacts
      await closePane(page, 'Share');
      for (const [type, label, n] of [
        ['history', 'History', '11'],
        ['details', 'Metadata', '12'],
        ['store', 'Store', '13'],
        ['sync', 'Sync', '14'],
        ['export', 'Export', '15'],
        ['workshop', 'Workshop', '16'],
      ] as const) {
        await ensurePane(page, type, `Toggle ${label.toLowerCase()}`);
        await shot(page, `${n}-pane-${type}`);
        await closePane(page, label);
      }
      // All panes open
      for (const [type, label] of [
        ['history', 'History'],
        ['details', 'Metadata'],
        ['store', 'Store'],
        ['sync', 'Sync'],
        ['export', 'Export'],
        ['publish', 'Share'],
      ] as const)
        await ensurePane(page, type, `Toggle ${label.toLowerCase()}`);
      await shot(page, '17-all-panes');

      // Settings, connected (Sync + Plan sections)
      await page.keyboard.press('ControlOrMeta+,');
      await page.locator('h2', { hasText: /^Sync$/ }).click();
      await shot(page, '18-settings-sync');
      await page
        .locator('h2', { hasText: /^Plan$/ })
        .click()
        .catch(() => {});
      await shot(page, '19-settings-plan');
      await page.keyboard.press('Escape');

      // Mood bar + Mood Builder
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await shot(page, '20-mood-bar');
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await shot(page, '21-mood-builder');
      await page.getByRole('button', { name: 'Persona', exact: true }).click();
      await shot(page, '22-mood-persona');
      await page.getByRole('button', { name: 'Done' }).click();

      // Home Garden with a card, the new crux modal, the delete dialog, the Trash
      await page.locator('header').getByRole('button').first().click();
      await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
      await shot(page, '23-home-cards');
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await shot(page, '24-new-crux');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Account menu' }).click();
      await shot(page, '25-account-menu');
      await page.keyboard.press('Escape');
    } finally {
      await app.close();
      await api.close();
    }
  });
});
