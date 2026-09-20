import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * The Plasma theme as a gate, not as evidence: the invariants that the
 * 2026-09-19 tour found broken, asserted so they stay fixed.
 *
 *  - An overlay (a dialog above the scrim, a menu above a pane) paints its
 *    own plate, because the material is one canvas behind everything and can
 *    never reach it; and it is not registered with the renderer, or its shape
 *    is drawn under the scrim and notches whatever it overlaps.
 *  - A page outside the Shell wears the same dock as the TopBar.
 *  - A control that borrows a panel class keeps its paint.
 *  - The material is drawing the primary surfaces and only those.
 *
 * The renderer handle is dev-only (`__plasmaRenderer`), so shape assertions
 * are skipped against a production build; the style assertions always run.
 */
type Rec = { el: HTMLElement; removing?: boolean };
type Win = Window & { __plasmaRenderer?: { recs: Map<number, Rec> } };

test('plasma: overlays paint a plate, pages wear a dock, controls keep their paint', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp();
  const bg = (selector: string) =>
    page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderTopColor, height: cs.height };
    }, selector);
  const shapes = () =>
    page.evaluate(() => {
      const r = (window as unknown as Win).__plasmaRenderer;
      if (!r) return null;
      // A removed surface forms out for a quarter second before it leaves the
      // renderer; it is not a surface the page has.
      return [...r.recs.values()]
        .filter((rec) => !rec.removing)
        .map((rec) => rec.el.className.toString());
    });
  const transparent = 'rgba(0, 0, 0, 0)';
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await expect(page.locator('html')).toHaveAttribute('data-surface-style', 'plasma');

    // Home Garden: the panels are the material's. The TopBar is a dock when
    // the Mood's chrome is material, and a plain translucent strip the ground
    // never registers when the chrome is flat (the Plasma Mood, after Tigrana).
    const barOn = (await page.getAttribute('html', 'data-plasma-chrome')) !== 'flat';
    if (barOn) expect(await bg('header.bg-toolbar')).toMatchObject({ bg: transparent });
    else expect((await bg('header.bg-toolbar'))?.bg).not.toBe(transparent);
    const home = await shapes();
    if (home) {
      expect(home.some((c) => c.includes('bg-panel'))).toBe(true);
      expect(home.some((c) => c.includes('bg-toolbar'))).toBe(barOn);
    }

    // A dialog: drawn by its own overlay canvas above the scrim where the
    // material can run (the plate steps aside), a painted plate where it
    // cannot; never a shape on the ground canvas either way.
    await page.getByRole('button', { name: 'Add Crux' }).click();
    const dialog = page.locator('[data-modal-open] .bg-panel').first();
    await expect(dialog).toBeVisible();
    const overlay = page.locator('[data-modal-open][data-plasma-overlay]');
    if (await overlay.count()) {
      await expect(overlay.locator('canvas')).toHaveCount(1);
      expect((await bg('[data-modal-open] .bg-panel'))?.bg).toBe(transparent);
      // The contents wait for the material, then arrive: the forming mark
      // clears within a second and nothing is left held at opacity 0.
      await expect(page.locator('[data-plasma-forming]')).toHaveCount(0, { timeout: 3_000 });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              getComputedStyle(document.querySelector('[data-modal-open] .bg-panel > *')!).opacity,
          ),
        )
        .toBe('1');
    } else {
      const dialogStyle = await bg('[data-modal-open] .bg-panel');
      expect(dialogStyle?.bg).not.toBe(transparent);
      expect(dialogStyle?.border).not.toBe(transparent);
    }
    const withDialog = await shapes();
    if (withDialog && home) {
      const panels = (list: string[]) => list.filter((c) => c.includes('bg-panel')).length;
      expect(panels(withDialog)).toBe(panels(home));
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // A menu: grown out of the top bar on its own overlay canvas where the
    // material can run (the plate steps aside, the ground hands the bar over),
    // a painted plate where it cannot; never a shape on the ground canvas.
    await page.getByRole('button', { name: 'Account menu' }).click();
    const menuOverlay = page.locator('header [data-plasma-host][data-plasma-overlay]');
    if (await menuOverlay.count()) {
      await expect(menuOverlay.locator('canvas')).toHaveCount(1);
      expect((await bg('.bg-dropdown'))?.bg).toBe(transparent);
      await expect(page.locator('header.bg-toolbar[data-plasma-claimed]')).toHaveCount(1);
    } else {
      expect((await bg('.bg-dropdown'))?.bg).not.toBe(transparent);
    }
    const withMenu = await shapes();
    if (withMenu) {
      expect(withMenu.some((c) => c.includes('bg-dropdown'))).toBe(false);
      if (await menuOverlay.count())
        expect(withMenu.some((c) => c.includes('bg-toolbar'))).toBe(false);
    }
    // Closed, the ground takes the bar back.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.locator('.bg-dropdown')).toHaveCount(0);
    await expect(page.locator('header.bg-toolbar[data-plasma-claimed]')).toHaveCount(0);

    // A page outside the Shell: the same dock, the same height.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/plans');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const pageHeader = page.locator('header.bg-toolbar');
    await expect(pageHeader).toContainText('Plans');
    const topBarHeight = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--toolbar-height').trim(),
    );
    expect((await bg('header.bg-toolbar'))?.height).toBe(topBarHeight);
    // Plans' main is a panel sized to its content, not the viewport.
    const mainBox = await page.locator('main').boundingBox();
    expect(mainBox!.height).toBeLessThan(500);

    // A control that borrows a panel class keeps its paint.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/tending');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const search = page.getByLabel('Search Tending');
    await expect(search).toBeVisible();
    expect(await bg('input[aria-label="Search Tending"]')).not.toMatchObject({ bg: transparent });

    // The builder's panes are the material's; the model picker's menu is not.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/home');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await createCrux(page, 'Plasma gate');
    await page.getByTestId('model-selector').click();
    // The picker: raised on the pane by its own overlay canvas where the
    // material can run (plate gone), a painted plate where it cannot.
    const pickerOverlay = page.locator('[data-plasma-host][data-plasma-overlay]');
    const picker = await bg('.bg-model-selector-dropdown');
    if (await pickerOverlay.count()) expect(picker?.bg).toBe(transparent);
    else expect(picker?.bg).not.toBe(transparent);
    const inBuilder = await shapes();
    if (inBuilder) {
      expect(inBuilder.some((c) => c.includes('mosaic-window'))).toBe(true);
      expect(inBuilder.some((c) => c.includes('bg-model-selector-dropdown'))).toBe(false);
    }
  } finally {
    await app.close();
  }
});
