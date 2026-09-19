import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { launchApp } from './launch';
import { createCrux } from './multi-crux-helpers';

/**
 * Every page of the app under the Plasma theme, as evidence rather than as a
 * gate: it takes screenshots and asserts nothing about how they look. The
 * point is to see the theme applied to surfaces that were designed for a flat
 * one, all in a row, before deciding which of them need work.
 *
 * Runs against a dev server when CRUX_DEV_SERVER is set, or the built app
 * otherwise. Shots land in CRUX_TOUR_SHOTS (default e2e/.results/tour).
 */
const SHOTS = process.env.CRUX_TOUR_SHOTS ?? 'e2e/.results/tour';

test('plasma across every page', async () => {
  test.setTimeout(20 * 60_000);
  mkdirSync(SHOTS, { recursive: true });
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });

  const shot = async (name: string, settle = 1500) => {
    await page.waitForTimeout(settle);
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };
  const click = async (p: Page, name: RegExp | string, exact = false) => {
    const b = p.getByRole('button', { name, exact }).first();
    if (!(await b.isVisible().catch(() => false))) return false;
    await b.click().catch(() => {});
    return true;
  };
  const esc = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  };
  // In-app navigation keeps the garden's state; a full goto reloads the
  // renderer and lands on the Gateway.
  const go = async (path: string) => {
    await page.evaluate((p) => window.history.pushState({}, '', p), path);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await page.waitForTimeout(1200);
  };

  try {
    await page.setViewportSize({ width: 1500, height: 950 });

    // ── Gateway, step by step ────────────────────────────────────────────
    await shot('01-gateway', 3000);
    await page.getByRole('button', { name: /enter/i }).click();
    await shot('01b-gateway-choice');
    await page.getByText('Plant a new garden').click();
    await shot('01c-gateway-plant');
    await page.getByRole('button', { name: 'Welcome' }).click();
    await page.getByRole('button', { name: 'Add Crux' }).waitFor();
    await shot('02-home-garden-empty');

    // ── A garden with something in it ────────────────────────────────────
    for (const name of ['Field notes', 'Tide charts', 'Lantern']) {
      await createCrux(page, name);
      await page.waitForTimeout(1500);
      await page.locator('header').getByRole('button').first().click();
      await page.waitForTimeout(1200);
    }
    await shot('03-home-garden-cards');
    await page.locator('.bg-garden-card').first().hover();
    await shot('03b-home-garden-card-hover', 600);

    if (await click(page, 'Add Crux')) {
      await shot('04-add-crux-dialog');
      await page.mouse.wheel(0, 900);
      await shot('04b-add-crux-dialog-scrolled', 600);
      await esc();
    }

    // ── Top-bar menus ────────────────────────────────────────────────────
    if (await click(page, 'Account menu')) {
      await shot('05-account-menu', 700);
      await esc();
    }
    if (await click(page, 'Explore')) {
      await shot('06-explore-modal');
      await esc();
    }
    if (await click(page, 'Mood')) {
      await shot('07-mood-panel');
      await esc();
    }
    if (await click(page, 'Console')) {
      await shot('08-console');
      await esc();
    }

    // ── Settings, every tab ──────────────────────────────────────────────
    if (await click(page, 'Account menu')) {
      const item = page.getByRole('menuitem', { name: /settings/i }).first();
      if (await item.isVisible().catch(() => false)) await item.click();
      else
        await page
          .getByRole('button', { name: /^Settings/ })
          .first()
          .click();
      await shot('09-settings');
      const tabs = page.getByRole('dialog').getByRole('tab');
      const n = await tabs.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const label = ((await tabs.nth(i).textContent()) ?? `tab-${i}`).trim().toLowerCase();
        await tabs.nth(i).click();
        await shot(`09-settings-${label.replace(/[^a-z]+/g, '-')}`, 700);
      }
      await esc();
    }

    // ── Pages ────────────────────────────────────────────────────────────
    await go('/explore');
    await shot('10-explore', 3000);
    await go('/tending');
    await shot('11-tending', 2500);
    await go('/mood');
    await shot('12-mood-builder', 2500);
    for (const tab of ['Moods', 'Background', 'Sound', 'Persona']) {
      if (await click(page, tab, true)) await shot(`12-mood-builder-${tab.toLowerCase()}`, 900);
    }
    await go('/plans');
    await shot('13-plans', 2500);
    await go('/nowhere-at-all');
    await shot('14-not-found', 2500);
    await go('/@nobody-here');
    await shot('14b-public-garden-missing', 2500);

    // ── The builder ──────────────────────────────────────────────────────
    await go('/home');
    await page.locator('.bg-garden-card').first().click();
    await page.getByPlaceholder('Send a message...').waitFor({ timeout: 30_000 });
    await shot('15-crux-builder', 3000);

    const input = page.getByPlaceholder('Send a message...');
    await input.fill('Please write hello');
    await input.press('Enter');
    await page
      .getByText('Done — I wrote that file for you.')
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
    await shot('16-collaboration-turn', 1500);

    for (const label of ['artifacts', 'history', 'metadata']) {
      await click(page, `Toggle ${label}`);
      await page.waitForTimeout(400);
    }
    await shot('17-builder-all-panes', 2000);

    // The file open in the editor.
    const file = page.getByRole('tree').getByText('hello.txt', { exact: true });
    if (await file.isVisible().catch(() => false)) {
      await file.click();
      await shot('18-editor-open', 2000);
    }

    // The model picker, expanded model info, then the publish dialog.
    const selector = page.getByTestId('model-selector');
    if (await selector.isVisible().catch(() => false)) {
      await selector.click();
      await shot('19-model-selector', 700);
      await esc();
    }
    if (await click(page, /publish/i)) {
      await shot('20-publish-dialog');
      await esc();
    }

    // Workspace switcher.
    if (await click(page, 'Switch Crux workspace')) {
      await shot('21-workspace-switcher', 700);
      await esc();
    }

    await page.setViewportSize({ width: 1100, height: 760 });
    await shot('22-builder-narrow', 1500);
    await page.setViewportSize({ width: 1500, height: 950 });
  } finally {
    await app.close();
  }
});
