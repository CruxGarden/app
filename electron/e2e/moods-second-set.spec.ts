import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';

/**
 * The thirteen Moods added from backgrounds/ on 2026-09-14 (ADR 0043 note):
 * each applies from the Mood bar, paints its render, its accent and glass,
 * and leaves a screenshot of a real workspace as evidence.
 */
const SECOND_SET: Array<{ id: string; accent: string; light?: boolean }> = [
  { id: 'ember-horizon', accent: '#f0623a' },
  { id: 'last-light', accent: '#e8a06a' },
  { id: 'holo-collage', accent: '#ff9ec6' },
  { id: 'iridescent-hall', accent: '#7a6aa8', light: true },
  { id: 'neon-pool', accent: '#ff8fb7' },
  { id: 'vortex-road', accent: '#d9a06a' },
  { id: 'back-room', accent: '#d7b36a' },
  { id: 'cave-window', accent: '#d9b56a' },
  { id: 'painted-panels', accent: '#e9a35c' },
  { id: 'mist-ridge', accent: '#5c625c', light: true },
  { id: 'blue-raster', accent: '#7a7cff' },
  { id: 'signal-loss', accent: '#e0313a' },
  { id: 'scanline', accent: '#f0863a' },
];

async function applyMood(page: Page, id: string) {
  await page.getByRole('button', { name: 'Mood', exact: true }).click();
  await page.getByTestId(`bundled-${id}`).getByRole('button', { name: 'Apply' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('bundled-moods')).toHaveCount(0);
}

test('the second set of bundled Moods applies and paints', async () => {
  test.setTimeout(8 * 60_000);
  const { app, page } = await launchApp();
  const evidence = resolve(__dirname, '../../docs/moods-second-set');
  mkdirSync(evidence, { recursive: true });
  const cssVar = (name: string) =>
    page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByText('Plant a new garden').click();
    await page.getByRole('button', { name: 'Welcome' }).click();
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Blank/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('.mosaic-window.pane-collaboration')).toBeVisible();
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await expect(page.getByTestId('bundled-moods').locator('[data-testid^="bundled-"]')).toHaveCount(36);
    await page.keyboard.press('Escape');
    for (const mood of SECOND_SET) {
      await applyMood(page, mood.id);
      await expect.poll(() => cssVar('--accent'), { timeout: 30_000 }).toBe(mood.accent);
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.surfaceStyle)).toBe('glass');
      await expect.poll(() => cssVar('--background-type')).toBe('image');
      await expect(page.getByTestId('mood-background-image')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.className))
        .toMatch(mood.light ? /light/i : /dark/i);
      // the intro veil names the Mood for a moment; the shot is of the workspace under it
      await expect(page.getByTestId('mood-intro')).toHaveCount(0, { timeout: 20_000 });
      await page.mouse.move(800, 900);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(evidence, `${mood.id}.png`) });
    }
  } finally {
    await app.close();
  }
});
