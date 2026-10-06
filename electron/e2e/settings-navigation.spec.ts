import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { showPane, chooseSettingsSection } from './panel-helpers';

test('Settings groups remain reachable in a small window without exposing advanced connection setup', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1008, 700),
    );
    await enterGarden(page);
    await showPane(page, 'Settings');
    await expect(page.getByRole('textbox', { name: 'API address' })).toBeHidden();
    await chooseSettingsSection(page, 'AI and agents');
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Enable AI Tools' })).toBeInViewport();
    await chooseSettingsSection(page, 'Garden and backups');
    await expect(page.getByRole('heading', { name: 'Desktop', exact: true })).toBeInViewport();
    await chooseSettingsSection(page, 'Appearance and panels');
    await expect(
      page.getByRole('button', { name: 'Customize appearance', exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole('textbox', { name: 'Name for Workshop', exact: true }),
    ).toBeHidden();
    await chooseSettingsSection(page, 'Account');
    await expect(page.getByRole('textbox', { name: 'API address' })).toBeHidden();
    const evidence = resolve(__dirname, '../../docs/product-review/2026-09-30');
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, 'polished-settings.png') });
    await page.getByText('Advanced connection settings', { exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'API address' })).toBeVisible();
    // Jumping between groups keeps their controls mounted and expanded state intact.
    await chooseSettingsSection(page, 'AI and agents');
    await expect(page.getByRole('switch', { name: 'Enable AI Tools' })).toBeInViewport();
  } finally {
    await app.close();
  }
});
