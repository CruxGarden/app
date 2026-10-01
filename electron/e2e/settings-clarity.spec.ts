import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, switchCrux } from './multi-crux-helpers';
import { showPane, hidePane } from './panel-helpers';

test('appearance Settings lead to the Customizer while panel naming stays available', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1008, 700),
    );
    await enterGarden(page);
    const settings = await showPane(page, 'Settings');
    await settings.getByRole('button', { name: 'Appearance and panels', exact: true }).click();
    await expect(
      settings.getByRole('button', { name: 'Customize appearance', exact: true }),
    ).toBeInViewport();
    await expect(
      settings.getByRole('textbox', { name: 'Name for Workshop', exact: true }),
    ).toBeHidden();
    const evidence = resolve(__dirname, '../../docs/settings-clarity');
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, 'appearance.png') });
    await settings.getByText('Custom panel names', { exact: true }).click();
    await settings.getByRole('textbox', { name: 'Name for Workshop', exact: true }).fill('Studio');
    await settings.getByRole('textbox', { name: 'Name for Workshop', exact: true }).press('Enter');
    await settings.getByRole('button', { name: 'Customize appearance', exact: true }).click();
    const mood = page.getByRole('region', { name: 'Mood', exact: true });
    await expect(
      mood.getByRole('heading', { name: 'Theme Customizer', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
    await hidePane(page, 'Mood');
    await expect(
      settings.getByRole('textbox', { name: 'Name for Workshop', exact: true }),
    ).toHaveValue('Studio');
  } finally {
    await app.close();
  }
});

test('startup preferences agree between already-open workspaces', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await createCrux(page, 'First workspace');
    let settings = await showPane(page, 'Settings');
    await settings.getByRole('button', { name: 'Getting started', exact: true }).click();
    await expect(
      settings.getByRole('switch', { name: 'Resume my last workspace on startup' }),
    ).not.toBeChecked();
    await createCrux(page, 'Second workspace');
    settings = await showPane(page, 'Settings');
    await settings.getByRole('button', { name: 'Getting started', exact: true }).click();
    await settings.getByRole('switch', { name: 'Resume my last workspace on startup' }).click();
    await switchCrux(page, 'First workspace');
    settings = await showPane(page, 'Settings');
    await settings.getByRole('button', { name: 'Getting started', exact: true }).click();
    await expect(
      settings.getByRole('switch', { name: 'Resume my last workspace on startup' }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Add panel', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Add panel' });
    await picker.getByRole('textbox', { name: 'Find a panel' }).fill('Share');
    await picker.getByRole('button', { name: 'Pin Share', exact: true }).click();
    await expect(
      page.locator('header').getByRole('button', { name: 'Toggle share', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await picker.getByRole('button', { name: 'Unpin Share', exact: true }).click();
    await expect(
      page.locator('header').getByRole('button', { name: 'Toggle share', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});
