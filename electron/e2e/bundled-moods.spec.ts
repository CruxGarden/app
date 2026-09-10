import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

type AudioState = { trackName: string | null; enabled: boolean; playing: boolean };

/**
 * The built-in Moods apply as whole rooms: theme tokens, background,
 * sound and persona change together. The Keeper — the Default Mood — brings
 * its own background image and track.
 */
test.describe('bundled moods', () => {
  for (const mood of [
    {
      id: 'siberian-blizzard',
      name: 'Siberian Blizzard',
      accent: '#efbd77',
      icons: 'line',
      title: 'Work through the winter',
      greeting: 'The kettle is on. What shall we get done while the snow settles?',
    },
    {
      id: 'silent-hill',
      name: 'Silent Hill',
      accent: '#814b3d',
      icons: 'line',
      title: 'Something beyond the fog',
      greeting: 'The fog can wait. What would you like to work on?',
    },
    {
      id: 'glumlot',
      name: 'GLUMLOT',
      accent: '#ff846c',
      icons: 'line',
      title: 'A signal from the chamber',
      greeting: 'The chamber is quiet. What would you like to bring into being?',
    },
    {
      id: '80s-fantasy',
      name: '80s Fantasy',
      accent: '#28534e',
      icons: 'line',
      title: 'A tale taking shape',
      greeting: 'Every great tale begins with a small act of making. What shall yours be?',
    },
    {
      id: '8-bit',
      name: '8-bit',
      accent: '#86efac',
      icons: 'pixel',
      title: 'A little pixel garden',
      greeting: 'Ready, player one. What shall we make?',
    },
    {
      id: 'glitchcore',
      name: 'Glitchcore',
      accent: '#66f7ff',
      icons: 'line',
      title: 'Something from the noise',
      greeting: 'Signal found. What are we making out of the noise?',
    },
  ]) {
    test(`${mood.name} applies its theme, garden image and persona and survives restart`, async () => {
      const { app, page, dir } = await launchApp();
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
      const again = await launchApp({ dir });
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

  test('apply Windows 95 then Blade Runner Rain: shape, sound and voice follow', async () => {
    const { app, page, dir } = await launchApp();
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
      // The Gateway itself wears The Keeper on a first run: vista and Moss before Enter
      await expect(page.getByTestId('mood-background-image')).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => cssVar('--accent')).toBe('#88bc88');
      // …and the Mood's track is already playing from the bar
      const bar = page.getByRole('region', { name: 'Mood Bar' });
      await expect(bar).toContainText('Echoes From Beyond');
      await expect.poll(async () => (await audio()).trackName).toBe('Echoes From Beyond');
      await expect.poll(async () => (await audio()).playing, { timeout: 15_000 }).toBe(true);
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('region', { name: 'Mood Bar' })).toBeVisible({
        timeout: 30_000,
      });
      // A fresh garden wears The Keeper: Moss accent, the vista, the track
      await expect.poll(() => cssVar('--accent'), { timeout: 30_000 }).toBe('#88bc88');
      await expect.poll(() => cssVar('--background-type')).toBe('image');
      await expect(page.getByTestId('mood-background-image')).toBeVisible();
      await expect.poll(async () => (await audio()).trackName).toBe('Echoes From Beyond');

      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      const built = page.getByTestId('bundled-moods');
      await expect(built).toBeVisible();
      await expect(built.locator('[data-testid^="bundled-"]')).toHaveCount(26);

      await built.getByTestId('bundled-windows-95').getByRole('button', { name: 'Apply' }).click();
      await expect.poll(() => cssVar('--radius')).toBe('0px');
      // Windows 95 is quiet: no track, sound still on
      await expect.poll(async () => (await audio()).trackName).toBeNull();
      expect((await audio()).enabled).toBe(true);

      await built
        .getByTestId('bundled-blade-runner-rain')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--accent')).toBe('#ff6a1a');
      await expect.poll(() => cssVar('--background-type')).toBe('flow');
      await page.screenshot({ path: 'e2e/.results/bundled-1-blade-runner.png' });

      // The persona rides along: the chat greeting is Deckard's
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByText('Deckard').first()).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'e2e/.results/bundled-2-workspace.png' });

      // Back to The Keeper from the browser: the track and the vista return
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await built.getByTestId('bundled-the-keeper').getByRole('button', { name: 'Apply' }).click();
      await expect.poll(async () => (await audio()).trackName).toBe('Echoes From Beyond');
      await expect.poll(() => cssVar('--background-type')).toBe('image');
      await page.keyboard.press('Escape');
      // A new crux greets with the Keeper's voice; its face sits on a theme gradient
      await page.getByRole('button', { name: /^wanderer-/ }).click(); // the username → Home Garden
      await page.getByRole('button', { name: 'Add Crux' }).click({ timeout: 30_000 });
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByText('The Keeper tends the garden').first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('persona-avatar').first()).toBeVisible();
    } finally {
      await app.close();
    }

    // Relaunch on the same garden: the Gateway wears the worn Mood before Enter
    const again = await launchApp({ dir });
    try {
      const cssVar2 = (name: string) =>
        again.page.evaluate(
          (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
          name,
        );
      await expect.poll(() => cssVar2('--accent'), { timeout: 30_000 }).toBe('#88bc88');
      await expect(again.page.getByTestId('mood-background-image')).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await again.app.close();
    }
  });
});
