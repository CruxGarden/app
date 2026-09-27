import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, storedCrux } from '../multi-crux-helpers';
import { showPane, hidePane } from '../panel-helpers';
import { connectAccount } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 34 · Everywhere: accessibility and polish — a
 * keyboard-only path with visible focus and Escape; narrow + zoomed Settings
 * without clipped controls; the remote panels' loading, empty, error and
 * success states. Sustained-session feel and retesting fixes are manual.
 */

/** Does the element that holds focus show it? (an outline or a focus shadow) */
const focusIsVisible = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    const shadow = s.boxShadow !== 'none';
    const ring = [...el.classList].some((c) => /ring|focus/.test(c));
    return outline || shadow || ring;
  });

test.describe('guide 34 · Accessibility, polish and states', () => {
  test('FEEL-01 — keyboard only: Tab reaches Add Crux with visible focus, Enter creates, a file is written and saved, dialogs close on Escape and return focus', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      // Tab to "Add Crux": reachable, and focus shows.
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      const addCrux = page.getByRole('button', { name: 'Add Crux', exact: true });
      let reached = false;
      for (let i = 0; i < 60 && !reached; i++) {
        await page.keyboard.press('Tab');
        reached = await addCrux.evaluate((el) => el === document.activeElement);
      }
      expect(reached, 'Tab reaches Add Crux').toBe(true);
      expect(await focusIsVisible(page)).toBe(true);
      // Enter opens the dialog; the name field has focus; Escape closes it and gives focus back.
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Add Crux' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByPlaceholder('My Crux')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      // Focus should come back to the control that opened it (soft: the path continues).
      await expect.soft(addCrux).toBeFocused();
      // Create by keyboard alone.
      await addCrux.focus();
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      await page.keyboard.type('Keyed in');
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 30_000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      // A file: reach the controls, name it, type and save with the keyboard.
      await page.getByRole('button', { name: 'Add files', exact: true }).focus();
      expect(await focusIsVisible(page)).toBe(true);
      await page.keyboard.press('Enter');
      const newFile = page.getByRole('button', { name: 'New file' });
      await expect(newFile).toBeVisible({ timeout: 30_000 });
      await newFile.focus();
      await page.keyboard.press('Enter');
      const nameBox = page.getByRole('tree').getByRole('textbox');
      await expect(nameBox).toBeFocused();
      await page.keyboard.type('keyed.txt');
      await page.keyboard.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      // One click places the caret; everything else stays on the keyboard.
      await monaco.click();
      await page.keyboard.type('Typed without a mouse');
      await page.keyboard.press('ControlOrMeta+s');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      await expect
        .poll(() => {
          try {
            return readFileSync(join(folder, 'keyed.txt'), 'utf8');
          } catch {
            return '';
          }
        })
        .toBe('Typed without a mouse');
      // A dialog from a shortcut: Escape closes it and focus returns to the composer.
      const composer = page.getByPlaceholder('Send a message...');
      await composer.focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Alt+k' : 'Control+Alt+k');
      const switcher = page.getByRole('dialog', { name: 'Switch Crux workspace' });
      await expect(switcher).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Find a Crux in My Garden' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(switcher).toHaveCount(0);
      await expect(composer).toBeFocused();
      // The panel picker: open by keyboard, Escape returns to its button.
      const addPanel = page.getByRole('button', { name: 'Add panel', exact: true });
      await addPanel.focus();
      await page.keyboard.press('Enter');
      const picker = page.getByRole('dialog', { name: 'Add panel', exact: true });
      await expect(picker).toBeVisible();
      await expect(picker.getByRole('textbox', { name: 'Find a panel' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await expect.soft(addPanel).toBeFocused();
    } finally {
      await app.close();
    }
  });

  test('FEEL-02 — at 125% text in a narrow window, Settings either asks for room or shows every section without clipped controls or sideways scrolling; the account menu stays on screen', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    const setWindow = (width: number) =>
      app.evaluate(({ BrowserWindow }, width) => {
        const w = BrowserWindow.getAllWindows()[0]!;
        w.setSize(width, 760);
        w.webContents.setZoomFactor(1.25);
      }, width);
    try {
      await enterGarden(page);
      await setWindow(1000);
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThan(820);
      await page.keyboard.press('ControlOrMeta+,');
      const body = page.getByTestId('pane-body-settings');
      await expect(body).toBeVisible({ timeout: 30_000 });
      const pane = page.locator('.mosaic-window.pane-settings');
      // Too narrow: the pane asks for room rather than clipping. Widen until it shows its controls.
      let width = 1000;
      while ((await pane.locator('button').count()) < 10 && width < 1800) {
        await expect(pane.getByText('Widen the pane')).toBeVisible();
        width += 200;
        await setWindow(width);
        await page.waitForTimeout(500);
      }
      console.log(`[FEEL-02] Settings renders its controls from ${width}px at 125%`);
      // Every folded section open.
      const folded = pane.locator('button[aria-expanded="false"]');
      while ((await folded.count()) > 0) await folded.first().click();
      // Nothing scrolls sideways, and every control sits within the pane.
      const report = await pane.evaluate((pane) => {
        const box = pane.getBoundingClientRect();
        const wide = [...pane.querySelectorAll<HTMLElement>('*')].filter(
          (el) =>
            el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'hidden',
        );
        const controls = [...pane.querySelectorAll<HTMLElement>('button, input, select, textarea')]
          .filter((el) => el.getClientRects().length > 0 && el.type !== 'file')
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              label: (el.getAttribute('aria-label') || el.textContent || el.tagName)
                .trim()
                .slice(0, 40),
              clipped: r.left < box.left - 1 || r.right > box.right + 1,
            };
          });
        return {
          sideways: wide.map((el) => `${el.tagName}.${el.className}`.slice(0, 80)),
          clipped: controls.filter((c) => c.clipped).map((c) => c.label),
          controls: controls.length,
        };
      });
      expect(report.controls).toBeGreaterThan(10);
      expect(report.clipped, 'controls outside the pane').toEqual([]);
      expect(report.sideways, 'elements scrolling sideways').toEqual([]);
      await page.keyboard.press('ControlOrMeta+,');
      await expect(body).toHaveCount(0);
      // The account menu opens on screen at the narrow width.
      await setWindow(1000);
      await page.getByRole('button', { name: 'Account menu' }).click();
      const menuItem = page.getByRole('button', { name: /^Settings/ });
      await expect(menuItem).toBeVisible();
      await expect(menuItem).toBeInViewport({ ratio: 1 });
      await page.keyboard.press('Escape');
    } finally {
      await app
        .evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1),
        )
        .catch(() => {});
      await app.close();
    }
  });

  test('FEEL-04 — remote panels: Explore shows results, an honest empty state, and an error that is not disguised as empty; Sync loads to an outcome', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    api.state.cruxes['11111111-1111-4111-8111-111111111111'] = {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'rainy-garden-notes',
      title: 'Rainy Garden Notes',
      kind: 'page',
      visibility: 'public',
      discoverable: true,
      meta: { tags: ['rain'], publishedAt: '2026-09-02T00:00:00.000Z' },
      authorId: 'author-1',
      author_username: 'tester',
      created: '2026-09-01T00:00:00.000Z',
      updated: '2026-09-02T00:00:00.000Z',
    };
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      // Sync: signed in, the list says it is loading, then lands on an outcome.
      const settings = await showPane(page, 'Settings');
      await connectAccount(page, settings);
      await expect(settings.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
      await settings.locator('h2', { hasText: /^Sync$/ }).click();
      await expect(
        settings.getByText('Loading...').or(settings.getByText('No cruxes synced to cloud yet.')),
      ).toBeVisible();
      await expect(settings.getByText('No cruxes synced to cloud yet.')).toBeVisible({
        timeout: 30_000,
      });
      await expect(settings.getByText('Loading...')).toHaveCount(0);
      await hidePane(page, 'Settings');
      // Explore: success, then an honest empty.
      const explore = await showPane(page, 'Explore');
      await expect(explore.getByRole('link', { name: 'Rainy Garden Notes' })).toBeVisible({
        timeout: 30_000,
      });
      const box = explore.getByLabel('Search Explore');
      await box.fill('zebra crossing');
      await expect(explore.getByText('No results match your search')).toBeVisible();
      // The API goes away: an error with a next step, not "no results".
      await api.close();
      await box.fill('rainy');
      await expect(
        explore.getByText(/couldn't reach|could not reach|not answer|try again/i).first(),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(explore.getByText('No results match your search')).toHaveCount(0);
    } finally {
      await app.close();
      await api.close().catch(() => {});
    }
  });
});
