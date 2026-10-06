import { test, expect, type Locator, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { chooseSettingsSection } from './panel-helpers';

/**
 * Copy that names a place in Settings opens Settings there
 * (`openSettings({ section })`): "Workspace layouts…" in the panel picker
 * lands on the Workspace layouts card in Appearance and panels — when Settings
 * is closed, and again when it is already open somewhere else.
 */

/** Where the card sits in Settings' scrolling list: its top relative to the list, and how far the list is scrolled. */
const placeInList = (card: Locator) =>
  card.evaluate((el) => {
    let list = el.parentElement;
    while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement;
    if (!list) return null;
    const a = el.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    // Plasma can scale a pane; compare in the list's own units.
    const scale = b.height / list.clientHeight || 1;
    return {
      top: (a.top - b.top) / scale,
      height: list.clientHeight,
      scrolled: list.scrollTop,
    };
  });

async function currentSection(settings: Locator) {
  const nav = settings.getByRole('navigation', { name: 'Settings sections', exact: true });
  const chooser = nav.getByRole('combobox', { name: 'Settings section', exact: true });
  if (await chooser.isVisible()) return chooser.inputValue();
  const current = nav.locator('button[aria-current="location"]');
  return (await current.count()) ? (await current.innerText()).trim() : '';
}

async function chooseWorkspaceLayouts(page: Page) {
  await page.getByRole('button', { name: 'Add panel', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add panel' })
    .getByRole('button', { name: 'Workspace layouts…', exact: true })
    .click();
}

async function expectAtLayouts(page: Page) {
  const settings = page.getByRole('region', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible({ timeout: 30_000 });
  const card = settings.getByRole('region', { name: 'Workspace layouts', exact: true });
  await expect(card).toBeVisible();
  await expect.poll(() => currentSection(settings)).toMatch(/^(appearance|Appearance and panels)$/);
  // The card's heading is in view in the list, which had to scroll to get there.
  await expect
    .poll(async () => {
      const place = await placeInList(card);
      return !!place && place.scrolled > 0 && place.top > -4 && place.top < place.height - 40;
    })
    .toBe(true);
  return settings;
}

test('a named Settings place opens Settings at that card, whether Settings was closed or open', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await expect(page.getByTestId('pane-body-settings')).toHaveCount(0);

    // Closed: opens and lands on the card.
    await chooseWorkspaceLayouts(page);
    const settings = await expectAtLayouts(page);

    // Open elsewhere: moves back to the card without closing Settings.
    await chooseSettingsSection(page, 'Getting started');
    await expect
      .poll(
        async () =>
          (
            await placeInList(
              settings.getByRole('region', { name: 'Workspace layouts', exact: true }),
            )
          )?.scrolled ?? -1,
      )
      .toBeLessThan(5);
    await chooseWorkspaceLayouts(page);
    await expectAtLayouts(page);
    await expect(page.getByTestId('pane-body-settings')).toHaveCount(1);
  } finally {
    await app.close();
  }
});
