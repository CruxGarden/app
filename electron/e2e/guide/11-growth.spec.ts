import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { markVersion, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 11 · History — a Crux with many checkpoints stays
 * usable. The empty state and restores are journeys/01 and growth specs.
 */
test.describe('guide 11 · History', () => {
  test('GROW-06 — twelve versions list, scroll and open without freezing', async () => {
    test.setTimeout(240_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Many versions');
      const monaco = await writeFirstFile(page, 'index.html', '<h1>v0</h1>');
      for (let i = 1; i <= 12; i++) {
        await monaco.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(`<h1>v${i}</h1>`);
        await page.keyboard.press('ControlOrMeta+s');
        await markVersion(page, `Version ${i}`);
      }
      const history = page.getByTestId('pane-body-history');
      await expect(history.getByText('Version 12', { exact: true })).toBeVisible();
      await expect(history.getByText('Version 1', { exact: true })).toBeVisible();
      // The pane still answers: a card opens its snapshot view and Back returns.
      await history.getByText('Version 3', { exact: true }).click();
      await expect(page.getByRole('region', { name: 'Viewing a snapshot' })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole('button', { name: 'Back to current' }).first().click();
      await expect(page.getByRole('region', { name: 'Viewing a snapshot' })).toHaveCount(0);
      await expect(page.locator('.monaco-editor').first()).toContainText('v12');
    } finally {
      await app.close();
    }
  });
});
