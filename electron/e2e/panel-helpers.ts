import { expect, type Page, type Locator } from '@playwright/test';

/** Drive the actual closed-panel discovery UI; the bar contains open panels only. */
export async function togglePanel(
  page: Page,
  label: string,
  options?: Parameters<Locator['click']>[0],
) {
  const button = page.getByRole('button', { name: label, exact: true });
  if (!(await button.isVisible())) {
    await page.getByRole('button', { name: 'Add panel', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Find a panel', exact: true })
      .fill(label.replace(/^Toggle /, ''));
  }
  await button.click(options);
}

/** Read the bar, without opening a discovery surface or changing the workspace. */
export async function panelPressed(page: Page, label: string) {
  return (await page
    .locator('header')
    .getByRole('button', { name: label, exact: true })
    .and(page.locator('[aria-pressed="true"]'))
    .isVisible())
    ? 'true'
    : 'false';
}

export async function expectPanelBarReady(page: Page) {
  await expect(page.getByRole('button', { name: 'Add panel', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

type GardenPane = 'Mood' | 'Explore' | 'Settings' | 'Console' | 'Navigator';
const PANE_TYPE: Record<GardenPane, string> = {
  Mood: 'mood',
  Explore: 'explore',
  Settings: 'settings',
  Console: 'console',
  Navigator: 'navigator',
};
const paneLocator = (page: Page, pane: GardenPane) =>
  pane === 'Navigator'
    ? page.getByRole('complementary', { name: 'Navigator', exact: true })
    : pane === 'Console'
      ? page.getByRole('region', { name: /· Collaboration$/ })
      : page.getByRole('region', { name: pane, exact: true });
/**
 * In the layout already, even while its surface is still forming. Waits for
 * the workspace to render first, so a restored pane is never mistaken for a
 * closed one (pressing its button would then close it).
 */
const inLayout = async (page: Page, pane: GardenPane) => {
  await page.locator('[data-testid^="pane-body-"]').first().waitFor();
  return (await page.getByTestId(`pane-body-${PANE_TYPE[pane]}`).count()) > 0;
};
const press = (page: Page, pane: GardenPane) =>
  pane === 'Settings'
    ? page.keyboard.press('ControlOrMeta+,')
    : page.getByRole('button', { name: pane, exact: true }).click();

/**
 * Panes are remembered per workspace: open one only if it is not already in
 * the layout. A press during a Garden transition can land on the workspace
 * being left, so check again (pressing only ever opens here).
 */
export async function showPane(page: Page, pane: GardenPane) {
  const region = paneLocator(page, pane).first();
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await inLayout(page, pane))) await press(page, pane);
    if (
      await region.waitFor({ state: 'visible', timeout: 5000 }).then(
        () => true,
        () => false,
      )
    )
      return region;
  }
  await region.waitFor({ state: 'visible' });
  return region;
}

/** Close a pane if it is open. */
export async function hidePane(page: Page, pane: GardenPane) {
  if (!(await inLayout(page, pane))) return;
  await press(page, pane);
  await expect(page.getByTestId(`pane-body-${PANE_TYPE[pane]}`)).toHaveCount(0);
}
