import { showPane, hidePane, chooseSettingsSection } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { openFullThemeBuilder } from './multi-crux-helpers';

/**
 * Settings & Mood: both are workspace panes, opened from the TopBar / account
 * menu; a palette preset switch changes the document theme, and a persona
 * rename persists across closing and reopening.
 */
test.describe('settings & mood', () => {
  test('mood presets, persona rename, settings pane, escape discipline', async () => {
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
      const html = page.locator('html');

      // ── Mood → Themes: pick a light preset, theme class follows ──────────
      await showPane(page, 'Mood');
      await openFullThemeBuilder(page);
      await page.getByRole('button', { name: 'Ivory' }).click();
      await expect(html).toHaveClass(/\blight\b/);
      await page.getByRole('button', { name: 'Obsidian' }).click();
      await expect(html).toHaveClass(/\bdark\b/);
      await page.screenshot({ path: 'e2e/.results/settings-1-mood.png' });

      await hidePane(page, 'Mood');

      // ── Persona lives in the Mood pane: rename, close, come back ──────
      await (await showPane(page, 'Mood'))
        .getByRole('button', { name: 'Persona', exact: true })
        .click();
      const personaName = page.getByPlaceholder('Persona name');
      await personaName.fill('The Gardener');
      await page.waitForTimeout(400); // persona saves per change
      await hidePane(page, 'Mood');
      await (await showPane(page, 'Mood'))
        .getByRole('button', { name: 'Persona', exact: true })
        .click();
      await expect(page.getByPlaceholder('Persona name')).toHaveValue('The Gardener');
      await hidePane(page, 'Mood');

      // ── Settings via the account menu ────────────────────────────────────
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      for (const section of ['Account', 'AI and agents', 'Garden and backups'] as const) {
        await chooseSettingsSection(page, section);
        const group = page
          .getByTestId('pane-body-settings')
          .getByRole('region', { name: section, exact: true })
          .and(page.locator('section[tabindex="-1"]'));
        await expect(group).toBeFocused();
        await expect(group.locator(':scope > h2')).toHaveText(section);
        await expect(group.locator(':scope > h2')).toBeInViewport();
      }
      // Sync is only offered once an account is connected
      await expect(page.getByRole('heading', { name: 'Sync', exact: true })).toHaveCount(0);
      await chooseSettingsSection(page, 'Account');
      await expect(page.getByPlaceholder('email@example.com')).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/settings-2-settings.png' });
      await hidePane(page, 'Settings');

      // ── Cmd+, toggles Settings ───────────────────────────────────────────
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
