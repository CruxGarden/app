import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

type AudioState = {
  playing: boolean;
  trackName: string | null;
  ducked: boolean;
  cuesPlayed: number;
};

/** The Mood's track plays and loops; a mock AI turn plays cues and ducks it. */
test.describe('sound: track + cues', () => {
  test.setTimeout(150_000);

  test('the Default Mood has a track; an AI turn cues and ducks', async () => {
    const { app, page } = await launchApp({ sound: true, env: { CRUX_AI_MOCK: '1' } });
    const state = () =>
      page.evaluate(() =>
        (window as unknown as { __cruxAudio: { state: () => AudioState } }).__cruxAudio.state(),
      );
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      const dock = page.getByRole('region', { name: 'Mood Bar' });
      await expect(dock).toBeVisible({ timeout: 30_000 });
      // A fresh garden wears The Keeper: its track is already the Mood's
      await expect
        .poll(async () => (await state()).trackName, { timeout: 30_000 })
        .toBe('Echoes From Beyond');
      // It started on the Gateway (the room is set before you enter) and kept going
      await expect.poll(async () => (await state()).playing, { timeout: 15_000 }).toBe(true);
      await page.screenshot({ path: 'e2e/.results/cues-1-playing.png' });

      // A turn with a tool call → toolDone cue, ducked during, released after
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const before = (await state()).cuesPlayed;
      const input = page.getByPlaceholder('Send a message...');
      await input.fill('Please write hello slowly');
      await input.press('Enter');
      await expect.poll(async () => (await state()).ducked, { timeout: 10_000 }).toBe(true);
      await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
        timeout: 30_000,
      });
      await expect.poll(async () => (await state()).ducked).toBe(false);
      expect((await state()).cuesPlayed).toBeGreaterThanOrEqual(before + 1); // toolDone (message is off by default)
      // Pause from the bar; the Sound section shows the same track
      await dock.getByRole('button', { name: 'Pause soundscape' }).click();
      await expect.poll(async () => (await state()).playing).toBe(false);
    } finally {
      await app.close();
    }
  });
});
