import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * Every page of the app under the Plasma theme, as evidence rather than as a
 * gate: it takes screenshots and asserts nothing about how they look. The
 * point is to see the theme applied to surfaces that were designed for a flat
 * one, all in a row, before deciding which of them need work.
 */
const SHOTS = '/private/tmp/claude-501/-Users-daniel-Workspace-CruxGarden/d02ca105-6e0a-4d59-9601-856c2d77173e/scratchpad/tour';
const BASE = 'http://localhost:8080';

test('plasma across every page', async () => {
  test.setTimeout(20 * 60_000);
  mkdirSync(SHOTS, { recursive: true });
  const { app, page } = await launchApp({ env: { CRUX_DEV_SERVER: BASE } });
  const seen: Record<string, unknown> = {};

  const shot = async (name: string, settle = 2500) => {
    await page.waitForTimeout(settle);
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
    seen[name] = await page.evaluate(() => ({
      surface: document.documentElement.dataset.surfaceStyle,
      surfaces: document.querySelectorAll(
        '.mosaic-window, .bg-panel, .bg-dropdown, .bg-garden-card, .bg-toolbar, .crux-taskbar',
      ).length,
      canvas: !!document.querySelector('canvas'),
    }));
  };
  const go = async (path: string, name: string) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await shot(name, 5000);
  };
  const click = async (p: Page, name: RegExp | string) => {
    const b = p.getByRole('button', { name }).first();
    if (!(await b.isVisible().catch(() => false))) return false;
    await b.click().catch(() => {});
    return true;
  };

  try {
    await page.setViewportSize({ width: 1500, height: 950 });

    // 01 Gateway — the first screen, before a garden exists.
    await shot('01-gateway', 4000);

    await enterGarden(page);
    await shot('02-home-garden-empty');

    // A garden with something in it.
    for (const name of ['Field notes', 'Tide charts', 'Lantern']) {
      await createCrux(page, name);
      await page.waitForTimeout(2500);
      await page.getByRole('button', { name: /^wanderer-/ }).first().click();
      await page.waitForTimeout(2000);
    }
    await shot('03-home-garden-cards');

    // The Add Crux dialog, which is the biggest modal in the app.
    if (await click(page, 'Add Crux')) await shot('04-add-crux-dialog');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    await go('/explore', '05-explore');
    await go('/tending', '06-tending');
    await go('/mood', '07-mood-builder');
    await go('/plans', '08-plans');
    await go('/nowhere-at-all', '09-not-found');

    // Back into a crux for the builder and its panes.
    await go('/', '10-home-again');
    const card = page.locator('.bg-garden-card').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      await shot('11-crux-builder', 5000);
      for (const label of ['artifacts', 'history', 'metadata']) {
        await click(page, `Toggle ${label}`);
        await page.waitForTimeout(500);
      }
      await shot('12-builder-panes');
      if (await click(page, /growth|history/i)) await shot('13-growth');
    }

    // Overlays. The app puts most of its chrome in modals, and a modal over a
    // moving field is the case a flat theme never had to answer.
    for (const [name, label] of [
      ['14-settings', /settings/i],
      ['15-mood-panel', /mood/i],
      ['16-console', /keeper|console/i],
      ['17-explore-modal', /explore/i],
    ] as const) {
      if (await click(page, label)) {
        await shot(name);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(900);
      }
    }

    // What is actually registered, so over-capture shows up as a list rather
    // than as something odd in a screenshot.
    console.log(
      'REGISTERED ' +
        JSON.stringify(
          await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '.mosaic-window, .bg-panel, .bg-dropdown, .bg-garden-card, .bg-toolbar, .crux-taskbar',
              ),
            ].map((el) => {
              const r = el.getBoundingClientRect();
              return `${el.tagName} ${Math.round(r.width)}x${Math.round(r.height)} ${el.className.toString().slice(0, 60)}`;
            }),
          ),
          null,
          1,
        ),
    );

    console.log('SEEN ' + JSON.stringify(seen, null, 1));
  } finally {
    await app.close();
  }
});
