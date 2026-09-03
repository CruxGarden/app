import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Settings & Mood: the modals open from the TopBar / account menu, a palette
 * preset switch changes the document theme, a persona rename persists across
 * closing and reopening, and Escape closes ONE layer at a time (Modal owns
 * Escape — it used to also pop the Keeper console).
 */
test.describe('settings & mood', () => {
  test('mood presets, persona rename, settings modal, escape discipline', async () => {
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
      const html = page.locator('html');

      // ── Mood → Themes: pick a light preset, theme class follows ──────────
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      const mood = page.getByRole('heading', { name: 'Mood' });
      await expect(mood).toBeVisible();
      await page.getByRole('button', { name: 'Themes', exact: true }).click();
      await page.getByRole('button', { name: 'Ivory' }).click();
      await expect(html).toHaveClass(/\blight\b/);
      await page.getByRole('button', { name: 'Obsidian' }).click();
      await expect(html).toHaveClass(/\bdark\b/);
      await page.screenshot({ path: 'e2e/.results/settings-1-mood.png' });

      // ── Escape closes the Mood modal only — the Keeper console does NOT open
      await page.keyboard.press('Escape');
      await expect(mood).toHaveCount(0);
      await expect(page.getByText('Console — The Keeper')).toHaveCount(0);

      // ── Persona lives in the Mood Builder: rename, leave, come back ──────
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await page.getByRole('button', { name: 'Persona', exact: true }).click();
      const personaName = page.getByPlaceholder('Persona name');
      await personaName.fill('The Gardener');
      await page.waitForTimeout(400); // persona saves per change
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await page.getByRole('button', { name: 'Persona', exact: true }).click();
      await expect(page.getByPlaceholder('Persona name')).toHaveValue('The Gardener');
      await page.getByRole('button', { name: 'Done' }).click();

      // ── Settings via the account menu ────────────────────────────────────
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      for (const section of ['Account', 'AI', 'Garden']) {
        await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
      }
      // Sync is only offered once an account is connected
      await expect(page.getByRole('heading', { name: 'Sync', exact: true })).toHaveCount(0);
      await expect(page.getByPlaceholder('email@example.com')).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/settings-2-settings.png' });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
      // Escape closed the Settings modal only — the Keeper console did NOT open
      await expect(page.getByText('Console — The Keeper')).toHaveCount(0);

      // ── Cmd+, toggles Settings ───────────────────────────────────────────
      await page.keyboard.press('Meta+,');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await page.keyboard.press('Meta+,');
      await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
