import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { launchApp } from './launch';
import { createCrux, enterGarden, goHome } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

/**
 * The 2026-09-27 polish pass as evidence: the screens that pass changed, in
 * their resting and their answering states — a card under the pointer, a
 * menu and a dialog open, a turn in Collaboration, the panes of a Crux. It
 * asserts nothing; it is the quick look (about a minute and a half) where
 * plasma-tour is the long one. Opt-in: CRUX_POLISH_SHOTS=<dir>.
 */
const SHOTS = process.env.CRUX_POLISH_SHOTS;

test('polish pass: resting and answering states', async () => {
  test.skip(!SHOTS, 'Set CRUX_POLISH_SHOTS to a folder to take the polish-pass screenshots');
  test.setTimeout(8 * 60_000);
  mkdirSync(SHOTS!, { recursive: true });
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' }, titleTips: true });
  const shot = async (name: string, settle = 900) => {
    await page.waitForTimeout(settle);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 60_000 });
  };
  try {
    await page.setViewportSize({ width: 1500, height: 950 });
    await enterGarden(page);
    await shot('01-home-empty', 1800);

    for (const name of ['Field notes', 'Tide charts']) {
      await createCrux(page, name);
      await goHome(page);
    }
    await shot('02-home-cards', 1500);
    await page.locator('.bg-garden-card').first().hover();
    await shot('03-card-hover', 500);
    await page.getByRole('button', { name: 'Crux actions' }).first().click();
    await shot('04-card-menu', 500);
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 500);

    await page.getByRole('button', { name: 'Account menu' }).click();
    await shot('05-account-menu', 500);
    await page.getByRole('button', { name: 'Account menu' }).click();

    await page.getByRole('button', { name: 'Add panel' }).click();
    await shot('06-panel-picker', 500);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Add Crux' }).click();
    await shot('07-add-crux', 800);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Navigator', exact: true }).hover();
    await shot('08-tooltip', 700);
    // The Mood chip opens up on hover: what plays, the volume, the way to Sound.
    await page.getByRole('region', { name: 'Mood Bar' }).hover();
    await shot('08b-mood-chip', 700);

    // A Crux: the turn, the panes, the picker.
    await page.locator('.bg-garden-card').first().click();
    const input = page.getByPlaceholder('Send a message...');
    await input.waitFor({ timeout: 30_000 });
    await input.fill('Please write hello');
    await input.press('Enter');
    await page
      .getByText('Done — I wrote that file for you.')
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
    await shot('09-collaboration', 1200);
    for (const label of ['artifacts', 'growth', 'details'])
      await togglePanel(page, `Toggle ${label}`).catch(() => {});
    await shot('10-crux-panes', 1500);
    const selector = page.getByTestId('model-selector');
    if (await selector.isVisible().catch(() => false)) {
      await selector.click();
      await shot('11-model-picker', 600);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await shot('12-switcher', 600);
    await page.keyboard.press('Escape');
    // ⌘K: everything in one field, then narrowed by a word.
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
    await shot('12b-command-palette', 700);
    await page.keyboard.type('sh');
    await shot('12c-command-palette-query', 700);
    await page.keyboard.press('Escape');

    // Pages outside the Shell.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/explore');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await shot('13-explore-page', 2500);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/@nobody-here');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await shot('14-dead-end', 2500);
  } finally {
    await app.close();
  }
});
