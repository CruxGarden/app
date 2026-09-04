import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

type AudioState = {
  playing: boolean;
  mixName: string | null;
  volume: number;
  cuesPlayed: number;
  layerTypes: string[];
  mixCount: number;
};

/** Phase 5: the AI steers the soundscape — volume and mix switch from scripted turns. */
test.describe('resonance tools (mock AI)', () => {
  test('a chat turn lowers the volume; another switches the mix and chimes', async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
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
      await dock.getByRole('button', { name: 'Play soundscape' }).click();
      await expect.poll(async () => (await state()).playing).toBe(true);

      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const input = page.getByPlaceholder('Send a message...');
      await expect(input).toBeVisible({ timeout: 30_000 });

      await input.fill('make it quiet please');
      await input.press('Enter');
      await expect(page.getByText('Done — adjusted the room.').first()).toBeVisible({
        timeout: 30_000,
      });
      await expect.poll(async () => (await state()).volume).toBeCloseTo(0.2, 2);
      await expect(dock.getByRole('slider', { name: 'Soundscape volume' })).toHaveValue('0.2');

      await input.fill('let it rain');
      await input.press('Enter');
      await expect(page.getByText('Done — adjusted the room.')).toHaveCount(2, { timeout: 30_000 });
      await expect.poll(async () => (await state()).mixName).toBe('Night Rain');

      // "lofi": the model composes a brand-new mix (keys + beat + bass + vinyl) and switches to it
      const before = (await state()).mixCount;
      await input.fill('give me some lofi study beats');
      await input.press('Enter');
      await expect(page.getByText('Done — adjusted the room.')).toHaveCount(3, { timeout: 30_000 });
      await expect.poll(async () => (await state()).mixName).toBe('Lofi Study Beats');
      expect((await state()).layerTypes).toEqual(['keys', 'beat', 'bass', 'vinyl']);
      expect((await state()).mixCount).toBe(before + 1);
      await expect.poll(async () => (await state()).playing).toBe(true);
      await expect(dock.getByText('Lofi Study Beats')).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/resonance-tools-1.png' });
    } finally {
      await app.close();
    }
  });
});
