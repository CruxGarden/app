import { test, expect, type Page } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';

/**
 * V1-TESTING-GUIDE § 06 · Workspace frame and navigation — the rows the
 * journeys and panel specs left open. SHELL-03/04/07/08/10 are covered by
 * multi-crux-*, journeys/04, journeys/10, journeys/11 and lifecycle specs;
 * SHELL-05/06 are manual (feel, sound).
 */
const CRUX_PANES: { type: string; label: string; own?: boolean }[] = [
  { type: 'tasks', label: 'Tasks' },
  { type: 'collaboration', label: 'Collaboration' },
  { type: 'artifacts', label: 'Artifacts' },
  { type: 'workshop', label: 'Workshop' },
  { type: 'details', label: 'Metadata' },
  { type: 'history', label: 'History' },
  { type: 'export', label: 'Export' },
  { type: 'sync', label: 'Sync' },
  { type: 'publish', label: 'Share' },
  { type: 'store', label: 'Store' },
  { type: 'media', label: 'Find media' },
  { type: 'navigator', label: 'Navigator', own: true },
  { type: 'console', label: 'Garden Collaboration', own: true },
  { type: 'tending', label: 'Tending' },
  { type: 'mood', label: 'Mood', own: true },
  { type: 'synth', label: 'Crux Synth' },
  { type: 'browser', label: 'WWW' },
  { type: 'settings', label: 'Settings' },
  { type: 'explore', label: 'Explore', own: true },
];

async function openPicker(page: Page) {
  await page.getByRole('button', { name: 'Add panel', exact: true }).click();
  return page.getByRole('dialog', { name: 'Add panel', exact: true });
}

test.describe('guide 06 · Workspace frame', () => {
  test('SHELL-01 — every panel opens from the picker as a workspace pane, listed once, its square pressed', async () => {
    test.setTimeout(240_000);
    const { app, page } = await launchApp();
    try {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      await createCrux(page, 'Frame');
      for (const pane of CRUX_PANES) {
        const toggle = `Toggle ${pane.label.toLowerCase()}`;
        const body = page.getByTestId(`pane-body-${pane.type}`);
        if (await body.isVisible()) {
          // Open by default (Tasks, Collaboration): close it first so the picker path is exercised.
          await page.locator(`.mosaic-window.pane-${pane.type} .pane-toolbar-close`).click();
          await expect(body).toHaveCount(0);
        }
        const picker = await openPicker(page);
        const entries = picker.getByRole('button', { name: toggle, exact: true });
        await expect(entries).toHaveCount(1);
        await entries.click();
        await expect(body).toBeVisible({ timeout: 30_000 });
        // A pane in the mosaic, not a window or a fixed column.
        await expect(page.locator(`.mosaic-window.pane-${pane.type}`)).toBeVisible();
        if (!pane.own)
          await expect(
            page.locator('header').getByRole('button', { name: toggle, exact: true }),
          ).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('dialog', { name: 'Add panel', exact: true })).toHaveCount(0);
        // Leave the workspace tidy for the next one (the header's own close).
        await page.locator(`.mosaic-window.pane-${pane.type} .pane-toolbar-close`).click();
        await expect(body).toHaveCount(0);
      }
    } finally {
      await app.close();
    }
  });

  test('SHELL-09 — six panels share the room; the Tasks rail stays full height', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    try {
      await page.setViewportSize({ width: 1500, height: 940 });
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 30_000 });
      await enterGarden(page);
      await createCrux(page, 'Crowded');
      const mosaic = page.locator('.mosaic').first();
      // Tasks, Collaboration and Workshop open by default; three more make six.
      for (const label of ['artifacts', 'history', 'export']) {
        const before = await tiles(page);
        const railBefore = await tileArea(page, 'tasks');
        const picker = await openPicker(page);
        await picker.getByRole('button', { name: `Toggle ${label}`, exact: true }).click();
        await expect(page.getByTestId(`pane-body-${label}`)).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(400);
        // The new pane took room from one of the wide tiles, not from the rail.
        const shrunk = before.filter(
          (t) => t.type !== 'tasks' && t.area > (before.find((b) => b.type === t.type)?.area ?? 0) * 0,
        );
        const after = await tiles(page);
        const gaveRoom = shrunk.some((t) => (after.find((a) => a.type === t.type)?.area ?? 0) < t.area);
        expect(gaveRoom).toBe(true);
        expect(Math.abs((await tileArea(page, 'tasks')) - railBefore) / railBefore).toBeLessThan(0.05);
        const tasks = (await page.locator('.mosaic-window.pane-tasks').boundingBox())!;
        const frame = (await mosaic.boundingBox())!;
        expect(tasks.height).toBeGreaterThan(frame.height * 0.9);
      }
      // Six open panes; none asks to be widened at this size.
      await expect(page.locator('.mosaic-window')).toHaveCount(6);
      await expect(page.getByText('Widen the pane')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});

async function tiles(page: Page) {
  const bodies = page.locator('[data-testid^="pane-body-"]');
  const out: { type: string; area: number }[] = [];
  for (const body of await bodies.all()) {
    const id = (await body.getAttribute('data-testid'))!.replace('pane-body-', '');
    const box = await body.boundingBox();
    if (box) out.push({ type: id, area: box.width * box.height });
  }
  return out;
}
async function tileArea(page: Page, type: string) {
  return (await tiles(page)).find((t) => t.type === type)?.area ?? 0;
}
