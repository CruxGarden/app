import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { showPane, openPanel } from '../panel-helpers';

/** Every surface is a workspace panel: open, close, pin, and the arrangement persists per workspace. */
test('panels open anywhere, pins keep their square, arrangements persist', async () => {
  test.setTimeout(150_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    let page = instance.page;
    await enterGarden(page);
    // Garden Home is a workspace: Settings and Tending open beside it.
    await showPane(page, 'Settings');
    await showPane(page, 'Tending');
    await expect(page.getByTestId('pane-body-home')).toBeVisible();
    await page.getByTitle('Close Tending').click();
    await page.getByTitle('Close Settings').click();
    await expect(page.getByTestId('pane-body-tending')).toHaveCount(0);

    await createCrux(page, 'Desk');
    await openPanel(page, 'history', 'Toggle growth');
    const add = page.getByRole('button', { name: 'Add panel', exact: true });
    await add.click();
    const picker = page.getByRole('dialog', { name: 'Add panel', exact: true });
    await picker.getByRole('button', { name: 'Pin Growth', exact: true }).click();
    await expect(picker.getByRole('button', { name: 'Unpin Growth', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTitle('Close Growth').click();
    const square = page.locator('header').getByRole('button', { name: 'Toggle growth' });
    await expect(square).toHaveAttribute('aria-pressed', 'false');

    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByRole('button', { name: 'Open Desk', exact: true }).click();
    await expect(
      page.locator('header').getByRole('button', { name: 'Toggle growth' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('pane-body-history')).toHaveCount(0);
    await expect(page.getByTestId('pane-body-collaboration')).toBeVisible();
  } finally {
    await instance.app.close();
  }
});
