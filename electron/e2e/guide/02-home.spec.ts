import { test, expect, type Page } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux, goHome } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 02 · Home Garden — the rows the older specs left open.
 * HOME-02 (search/sort), HOME-04 (switching) and HOME-05 (delete/restore)
 * are covered by garden-panes, multi-crux-lifecycle and trash/recover specs.
 */
async function closeSwitcher(page: Page) {
  if (await page.getByRole('dialog', { name: 'Switch Crux workspace' }).isVisible())
    await page.keyboard.press('Escape');
}
async function renameCurrent(page: Page, title: string) {
  // The switcher may still be open from the last rename.
  if (!(await page.getByRole('dialog', { name: 'Switch Crux workspace' }).isVisible()))
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
  await page.getByRole('button', { name: 'Rename current Crux…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename Crux' });
  await dialog.getByRole('textbox', { name: 'Crux title' }).fill(title);
  return dialog;
}

test.describe('guide 02 · Home Garden', () => {
  test('HOME-01 — rename with Unicode and a long title; an empty title is refused', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      await createCrux(page, 'V1 Scratch');

      // Unicode keeps every character.
      const unicode = 'Jardín 🌱 Ünïcode — 花園';
      let dialog = await renameCurrent(page, unicode);
      await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        unicode,
      );

      // An empty title has a clear result: the Crux is called Untitled, never blank.
      dialog = await renameCurrent(page, '   ');
      await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Rename Crux' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Untitled',
      );

      // A long title does not hide the card's controls.
      const long = 'A very long title that keeps going and going '.repeat(4).trim();
      dialog = await renameCurrent(page, long);
      await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await closeSwitcher(page);
      await goHome(page);
      const card = page.getByRole('button', { name: `Open ${long}` });
      await expect(card).toBeVisible();
      const box = (await card.boundingBox())!;
      expect(box.width).toBeLessThan(600); // truncated, not stretched
      await card.locator('..').hover();
      await expect(card.locator('..').getByRole('button', { name: 'Crux actions' })).toBeVisible();
      // And the title survives a return trip.
      await card.click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        long.slice(0, 20),
      );
    } finally {
      await app.close();
    }
  });

  test('HOME-03 — the card shows that Crux: its title, description state and latest activity', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      await createCrux(page, 'Older one');
      await createCrux(page, 'Edited one');
      await writeFirstFile(page, 'index.html', '<h1>Edited</h1>');
      await goHome(page);
      await page.getByRole('button', { name: 'Updated', exact: true }).click();
      const home = page.getByTestId('pane-body-home');
      await expect(home.getByRole('button', { name: /^Open / }).first()).toHaveAccessibleName(
        'Open Edited one',
      );
      await expect(page.getByText(/^Updated /).first()).toBeVisible();
      await expect(page.getByText('No description yet').first()).toBeVisible();
      // The other card is its own Crux, not a copy of the open workspace.
      await expect(page.getByRole('button', { name: 'Open Older one' })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('HOME-07 — Home stays usable while the account is offline', async () => {
    const api = await startMockApi();
    const first = await launchApp({ env: { CRUX_API_URL: api.url } });
    const dir = first.dir;
    try {
      await expect(first.page.getByRole('button', { name: 'Enter' })).toBeVisible({
        timeout: 30_000,
      });
      await enterGarden(first.page);
      await createCrux(first.page, 'Offline work');
      await writeFirstFile(first.page, 'index.html', '<h1>Offline</h1>');
      const share = await openPanel(first.page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(first.page);
      const ask = first.page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(first.page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
    } finally {
      await first.app.close();
    }
    // The API goes away; the garden does not.
    await api.close();
    const again = await launchApp({ dir, env: { CRUX_API_URL: api.url } });
    try {
      await again.page
        .getByRole('button', { name: 'Enter', exact: true })
        .click({ timeout: 30_000 });
      await expect(again.page.getByTestId('pane-body-home')).toBeVisible({ timeout: 30_000 });
      await expect(again.page.getByRole('button', { name: 'Open Offline work' })).toBeVisible();
      await again.page.getByRole('button', { name: 'Open Offline work' }).click();
      await expect(again.page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Offline work',
      );
      await expect(again.page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
      // No blocking dialog stands in the way.
      await expect(again.page.getByRole('alertdialog')).toHaveCount(0);
    } finally {
      await again.app.close();
    }
  });
});
