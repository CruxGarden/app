import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

type AudioState = { trackName: string | null; enabled: boolean; playing: boolean };

/**
 * The built-in Moods apply as whole rooms: theme tokens, background,
 * sound and persona change together. Fractal Garden — the Default Mood — brings
 * its own background image and track.
 */
test.describe('bundled moods', () => {
  for (const mood of [
    {
      id: 'concrete-sky',
      name: 'Concrete Sky',
      accent: '#a9c0ce',
      icons: 'line',
      title: 'A long view',
      greeting: 'Concrete, fog and a long view. What are we building?',
    },
    {
      id: 'mirror-meadow',
      name: 'Mirror Meadow',
      accent: '#b8663a',
      icons: 'line',
      title: 'A reflection',
      greeting: 'The meadow reflects whatever you bring. What is it today?',
    },
    {
      id: 'night-city',
      name: 'Night City',
      accent: '#ff7bb0',
      icons: 'line',
      title: 'Something for tonight',
      greeting: 'The city is awake. What are we making tonight?',
    },
    {
      id: 'coral-castle',
      name: 'Coral Castle',
      accent: '#ffc98a',
      icons: 'line',
      title: 'Slow light',
      greeting: 'Down here the light moves slowly. What are we making?',
    },
    {
      id: 'raster-bars',
      name: 'Raster Bars',
      accent: '#4fbacc',
      icons: 'pixel',
      title: 'A little demo',
      greeting: 'LOAD "*",8,1 — ready. What are we writing?',
    },
    {
      id: 'hibiscus',
      name: 'Hibiscus',
      accent: '#c95a3c',
      icons: 'filled',
      title: 'More colour than you thought',
      greeting: 'Look closely: there is more colour than you thought. What shall we make?',
    },
  ]) {
    test(`${mood.name} applies its theme, garden image and persona and survives restart`, async () => {
      const { app, page, dir } = await launchApp({ sound: true });
      try {
        await enterGarden(page);
        await page.getByRole('button', { name: 'Mood', exact: true }).click();
        await page.getByTestId(`bundled-${mood.id}`).getByRole('button', { name: 'Apply' }).click();
        await expect
          .poll(() =>
            page.evaluate(() =>
              getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
            ),
          )
          .toBe(mood.accent);
        await expect(page.getByTestId('mood-background-image')).toBeVisible();
        await page.keyboard.press('Escape');
        await createCrux(page, mood.title);
        await expect(page.getByText(mood.greeting)).toBeVisible();
        if (mood.id === '8-bit')
          expect(
            await page.evaluate(async () => {
              await document.fonts.load('8px "Press Start 2P"');
              return document.fonts.check('8px "Press Start 2P"');
            }),
          ).toBe(true);
        await page.mouse.move(0, 0);
        await page.screenshot({ path: `/private/tmp/crux-${mood.id}-workspace.png` });
      } finally {
        await app.close();
      }
      const again = await launchApp({ sound: true, dir });
      try {
        await expect
          .poll(() =>
            again.page.evaluate(() =>
              getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
            ),
          )
          .toBe(mood.accent);
        await expect
          .poll(() =>
            again.page.evaluate(() =>
              getComputedStyle(document.documentElement).getPropertyValue('--icon-set').trim(),
            ),
          )
          .toBe(mood.icons);
        await expect(again.page.getByTestId('mood-background-image')).toBeVisible();
        await again.page.screenshot({ path: `/private/tmp/crux-${mood.id}-gateway.png` });
      } finally {
        await again.app.close();
      }
    });
  }

  test('apply Raster Bars then Night City: shape, sound and voice follow', async () => {
    const { app, page, dir } = await launchApp({ sound: true });
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    const audio = () =>
      page.evaluate(() =>
        (window as unknown as { __cruxAudio: { state: () => AudioState } }).__cruxAudio.state(),
      );
    try {
      // The Gateway itself wears the Default Mood on a first run — Plasma since
      // 2026-09-17: the material's own field (no image), its mint accent, no track
      await expect.poll(() => cssVar('--accent'), { timeout: 30_000 }).toBe('#9ff3e4');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.surfaceStyle))
        .toBe('plasma');
      const bar = page.getByRole('region', { name: 'Mood Bar' });
      await expect(bar).toContainText('No track');
      await expect.poll(async () => (await audio()).trackName).toBeNull();
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('region', { name: 'Mood Bar' })).toBeVisible({
        timeout: 30_000,
      });
      // A fresh garden wears Plasma too; Fractal Garden is one Apply away and brings its track
      await expect.poll(() => cssVar('--accent'), { timeout: 30_000 }).toBe('#9ff3e4');
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page
        .getByTestId('bundled-moods')
        .getByTestId('bundled-digital-fractal-garden')
        .getByRole('button', { name: 'Apply' })
        .click();
      await page.keyboard.press('Escape');
      await expect.poll(() => cssVar('--accent'), { timeout: 30_000 }).toBe('#5fd2a5');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.surfaceStyle))
        .toBe('glass');
      await expect.poll(() => cssVar('--background-type')).toBe('image');
      await expect(page.getByTestId('mood-background-image')).toBeVisible();
      await expect.poll(async () => (await audio()).trackName).toBe('Echoes From Beyond');

      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      const built = page.getByTestId('bundled-moods');
      await expect(built).toBeVisible();
      // The HyperMoods: the material Moods sit in the picker above, Office on the shelf.
      await expect(built.locator('[data-testid^="bundled-"]')).toHaveCount(36);
      await built.getByTestId('bundled-raster-bars').getByRole('button', { name: 'Apply' }).click();
      await expect.poll(() => cssVar('--radius')).toBe('2px');
      await expect.poll(() => cssVar('--motion-frames')).toBe('4');
      // Raster Bars is quiet: no track, sound still on
      await expect.poll(async () => (await audio()).trackName).toBeNull();
      expect((await audio()).enabled).toBe(true);
      await built.getByTestId('bundled-night-city').getByRole('button', { name: 'Apply' }).click();
      await expect.poll(() => cssVar('--accent')).toBe('#ff7bb0');
      await expect.poll(() => cssVar('--background-type')).toBe('image');
      await page.screenshot({ path: 'e2e/.results/bundled-1-night-city.png' });

      // The persona rides along: the chat greeting is Sol's
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByText('Sol').first()).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'e2e/.results/bundled-2-workspace.png' });

      // Back to the Default Mood from the browser: the track and the render return
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await built
        .getByTestId('bundled-digital-fractal-garden')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(async () => (await audio()).trackName).toBe('Echoes From Beyond');
      await expect.poll(() => cssVar('--background-type')).toBe('image');
      await page.keyboard.press('Escape');
      // A new crux greets with Iris's voice; the fallback face sits on a theme gradient
      await page.getByRole('button', { name: /^wanderer-/ }).click(); // the username → Home Garden
      await page.getByRole('button', { name: 'Add Crux' }).click({ timeout: 30_000 });
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByText('A fractal is a bloom that keeps blooming').first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('persona-avatar').first()).toBeVisible();
    } finally {
      await app.close();
    }

    // Relaunch on the same garden: the Gateway wears the worn Mood before Enter
    const again = await launchApp({ sound: true, dir });
    try {
      const cssVar2 = (name: string) =>
        again.page.evaluate(
          (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
          name,
        );
      await expect.poll(() => cssVar2('--accent'), { timeout: 30_000 }).toBe('#5fd2a5');
      await expect(again.page.getByTestId('mood-background-image')).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await again.app.close();
    }
  });
});
