import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

type AudioState = {
  playing: boolean;
  mixName: string | null;
  ducked: boolean;
  cuesPlayed: number;
  playlistEnabled: boolean;
};

/** Phase 3: the playlist advances on its own; a mock AI turn plays cues and ducks the mix. */
test.describe('resonance playlist + cues', () => {
  test.setTimeout(150_000);

  test('playlist advances; an AI turn cues and ducks', async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const state = () =>
      page.evaluate(() =>
        (window as unknown as { __cruxAudio: { state: () => AudioState } }).__cruxAudio.state(),
      );
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      const dock = page.getByRole('region', { name: 'Mood Dock' });
      await expect(dock).toBeVisible({ timeout: 30_000 });
      await dock.getByRole('button', { name: 'Play soundscape' }).click();
      await expect.poll(async () => (await state()).playing).toBe(true);

      // Playlist: first item 0.02 min (~1.2 s), enabled → advances to Still Air
      await dock.getByRole('button', { name: 'Open Mood Builder' }).click();
      await expect(page.getByRole('heading', { name: 'Mood Builder' })).toBeVisible();
      await page.getByRole('spinbutton', { name: 'Dusk in the Garden minutes' }).fill('0.02');
      await page.getByRole('checkbox', { name: 'Playlist enabled' }).check();
      await expect.poll(async () => (await state()).playlistEnabled).toBe(true);
      await expect.poll(async () => (await state()).mixName, { timeout: 15_000 }).toBe('Still Air');
      await page.getByRole('checkbox', { name: 'Playlist enabled' }).uncheck();
      await page.screenshot({ path: 'e2e/.results/cues-1-playlist.png' });

      // Back to a crux; a turn with a tool call → toolDone + message cues, ducked during, released after
      await page.getByRole('button', { name: 'Done' }).click();
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
    } finally {
      await app.close();
    }
  });
});
