import { expect, type Page, type Locator } from '@playwright/test';

/** Drive the actual closed-panel discovery UI; the bar contains open panels only. */
export async function togglePanel(
  page: Page,
  label: string,
  options?: Parameters<Locator['click']>[0],
) {
  const button = page.locator('header').getByRole('button', { name: label, exact: true });
  // A panel that is opening shows its square a moment later.
  if (
    await button.waitFor({ state: 'visible', timeout: 1500 }).then(
      () => true,
      () => false,
    )
  )
    return button.click(options);
  // From the picker, click inside it: the pane may open meanwhile, and its
  // same-named bar button would close it again.
  await page.getByRole('button', { name: 'Add panel', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Add panel' });
  await picker
    .getByRole('textbox', { name: 'Find a panel', exact: true })
    .fill(label.replace(/^Toggle /, ''));
  await picker.getByRole('button', { name: label, exact: true }).click(options);
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

/**
 * A native tool wants the Workshop's width: close Tasks and Collaboration
 * (they open beside every app Crux and leave the tool ~700 px, where tools
 * fold their own panels over each other). `talk` reopens Collaboration for a
 * turn and returns its composer.
 */
export async function giveToolRoom(page: Page) {
  await expectPanelBarReady(page);
  for (const label of ['Toggle tasks', 'Toggle collaboration'])
    if ((await panelPressed(page, label)) === 'true') await togglePanel(page, label);
}
export async function talk(page: Page) {
  if ((await panelPressed(page, 'Toggle collaboration')) !== 'true')
    await togglePanel(page, 'Toggle collaboration');
  const composer = page.getByPlaceholder('Send a message...');
  await expect(composer).toBeVisible({ timeout: 30_000 });
  return composer;
}

type GardenPane = 'Mood' | 'Explore' | 'Settings' | 'Console' | 'Navigator' | 'Tending';
const PANE_TYPE: Record<GardenPane, string> = {
  Mood: 'mood',
  Explore: 'explore',
  Settings: 'settings',
  Console: 'console',
  Navigator: 'navigator',
  Tending: 'tending',
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
/** Explore and Tending are ordinary panels since the calm top bar: the picker toggles them. */
const PICKER_PANES = new Set<GardenPane>(['Explore', 'Tending']);
const press = (page: Page, pane: GardenPane) =>
  pane === 'Settings'
    ? page.keyboard.press('ControlOrMeta+,')
    : PICKER_PANES.has(pane)
      ? togglePanel(page, `Toggle ${pane.toLowerCase()}`)
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

/** Settings → AI: turn the collaborator on with a (fake) Anthropic key, then close Settings. */
export async function enableAi(page: Page) {
  const settings = await showPane(page, 'Settings');
  await settings.locator('h2', { hasText: /^AI$/ }).click();
  const toggle = settings.getByRole('switch', { name: 'Enable AI Tools' });
  // Idempotent: the suite starts gardens with AI on (launchApp's `ai`), a spec may not.
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  const key = settings.getByPlaceholder('sk-ant-...');
  await key.fill('sk-ant-e2e-not-a-real-key');
  await key.press('Enter');
  await expect(settings.getByPlaceholder('sk-ant-...')).toHaveCount(0, { timeout: 15_000 });
  await hidePane(page, 'Settings');
}

/** Open a Crux pane if it is not in the layout already; never toggles an open one shut. */
export async function openPanel(page: Page, type: string, label: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  // The bar lists open panels only, and it knows before the pane's body mounts.
  const inBar = await page
    .locator('header')
    .getByRole('button', { name: label, exact: true })
    .count();
  if (!inBar && !(await body.count())) await togglePanel(page, label);
  await expect(body).toBeVisible({ timeout: 30_000 });
  return body;
}

/** ⌘K: open the command palette and run the first command matching `query`. */
export async function runCommand(page: Page, query: string, command?: string) {
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox', { name: 'Search or run a command' }).fill(query);
  const option = command
    ? palette.getByRole('option', { name: command, exact: true })
    : palette.getByRole('option').first();
  await option.click();
  await expect(palette).toBeHidden();
}

/**
 * Tasks arrives once a task exists (UX pass 2, 2026-09-27); before the first
 * one, open the panel to reach New task. Never closes an open Tasks pane.
 */
export async function newTaskButton(page: Page) {
  await openPanel(page, 'tasks', 'Toggle tasks');
  const button = page.getByRole('button', { name: 'New task', exact: true });
  await expect(button).toBeVisible({ timeout: 30_000 });
  return button;
}
