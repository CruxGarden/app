import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

const SHOTS = process.env.CRUX_TOUR_SHOTS ?? 'e2e/.results/tour';

/**
 * The breadcrumb is Garden › Cruxspace › Crux: the Cruxspace step appears
 * once the Crux on screen belongs to one, its menu lists every Cruxspace and
 * the way back to the Garden, and the Crux switcher offers the Cruxspace's
 * other Cruxes whether or not they are open (Daniel, 2026-09-19).
 */
test('the breadcrumb walks Garden, Cruxspace and Crux in one place', async () => {
  test.setTimeout(150000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await createCrux(page, 'Album website');
    await createCrux(page, 'Liner notes');
    await createCrux(page, 'Tour poster');
    // No Cruxspace yet: no crumb.
    await expect(page.getByTestId('cruxspace-crumb')).toHaveCount(0);

    await page.locator('header').getByRole('button').first().click();
    await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
    await page.getByLabel('Cruxspace name').fill('Album release');
    for (const name of ['Album website', 'Liner notes'])
      await page.getByRole('checkbox', { name, exact: true }).check();
    await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
    await expect(page.getByLabel('Cruxspace', { exact: true })).toContainText('Album release');
    await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
    await page.getByLabel('Cruxspace name').fill('Tour');
    await page.getByRole('checkbox', { name: 'Tour poster', exact: true }).check();
    await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
    await expect(page.getByLabel('Cruxspace', { exact: true })).toContainText('Tour');

    // Close the Liner notes workspace so the switcher has a member that is not open.
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await page.getByRole('button', { name: 'Close Liner notes workspace' }).click();
    await page.getByRole('button', { name: 'Discard edits and close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Into a member: the crumb names its Cruxspace.
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await page.getByRole('button', { name: /^(✓ )?Album website / }).click();
    const crumb = page.getByTestId('cruxspace-crumb');
    await expect(crumb).toContainText('Album release');
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Album website',
    );

    // Its menu: every Cruxspace, the current one marked, and the Garden.
    await page.getByRole('button', { name: 'Switch Cruxspace' }).click();
    const menu = page.getByRole('menu', { name: 'Cruxspaces' });
    await expect(menu.getByRole('menuitem', { name: /✓ Album release/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^Tour/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Your garden' })).toBeVisible();
    // Under Plasma the menu's text fades in once its material has formed.
    await expect(page.locator('[data-plasma-forming]')).toHaveCount(0, { timeout: 3_000 });
    await page.screenshot({ path: `${SHOTS}/cruxspace-crumb-menu.png` });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // The Crux switcher offers the Cruxspace's other Crux though it is closed.
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'Switch Crux workspace' });
    await expect(
      dialog.getByRole('textbox', { name: 'Find a Crux in Album release' }),
    ).toBeFocused();
    await expect(dialog.getByText('In Album release · not open')).toBeVisible();
    // Tour poster is open, so it is listed as an open Crux, not as a member.
    await expect(dialog.getByRole('button', { name: /^Tour poster / })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/cruxspace-crumb-switcher.png` });
    await dialog.getByRole('button', { name: /^Liner notes / }).click();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Liner notes',
    );
    await expect(crumb).toContainText('Album release');

    // Another Cruxspace from the menu lands on the Garden with it selected.
    await page.getByRole('button', { name: 'Switch Cruxspace' }).click();
    await page.getByRole('menuitem', { name: /^Tour/ }).click();
    await expect(page.getByLabel('Cruxspace', { exact: true })).toHaveValue(/.+/);
    await expect(page.getByLabel('Cruxspace', { exact: true })).toContainText('Tour');
    const selected = await page
      .getByLabel('Cruxspace', { exact: true })
      .evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent);
    expect(selected).toBe('Tour');
  } finally {
    await app.close();
  }
});
