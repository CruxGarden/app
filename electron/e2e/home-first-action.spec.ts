import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, goHome } from './multi-crux-helpers';
import { showPane } from './panel-helpers';

test('an empty Garden puts both starting choices in view in a small split workspace', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1008, 700),
    );
    await enterGarden(page);
    const settings = await showPane(page, 'Settings');
    await expect(
      settings.getByRole('combobox', { name: 'Settings section', exact: true }),
    ).toBeVisible();
    await expect(
      settings.getByRole('combobox', { name: 'Settings section', exact: true }),
    ).toHaveValue('start');
    const home = page.getByTestId('pane-body-home');
    const collection = home.getByRole('button', {
      name: 'Explore undertakings — a collection of projects',
      exact: true,
    });
    const single = home.getByRole('button', { name: 'Just a Crux — one project', exact: true });
    await expect(collection).toBeInViewport({ ratio: 1 });
    await expect(single).toBeInViewport({ ratio: 1 });
    await expect(home.getByPlaceholder('Search cruxes...')).toBeHidden();
    const evidence = resolve(__dirname, '../../docs/home-clarity');
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, 'first-actions.png') });
    await single.click();
    await expect(page.getByRole('dialog', { name: 'Add Crux' })).toBeVisible();
    await page.keyboard.press('Escape');
    await createCrux(page, 'One clear step');
    await goHome(page);
    const search = home.getByPlaceholder('Search cruxes...');
    await expect(search).toBeVisible();
    await search.fill('Nothing matches');
    await expect(home.getByText('No cruxes match your search', { exact: true })).toBeVisible();
    await home.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(
      home.getByRole('button', { name: 'Open One clear step', exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});
