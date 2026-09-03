import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

type AudioState = {
  playing: boolean;
  activeMixId: string;
  mixName: string | null;
  layerCount: number;
  volume: number;
  contextState: string;
  optIn: boolean;
};

/**
 * Resonance Sound Mixer, Phase 1: the Mood Dock plays the Default Mood's
 * soundscape for real (Tone.js in the renderer), volume and mix switching
 * work, opt-in + "was playing" survive a restart. Asserted through the audio
 * store's read model, not by listening.
 */
test.describe('resonance (Mood Dock)', () => {
  test.setTimeout(150_000);

  test('play, volume, next mix, collapse, persist across restart', async () => {
    const { app, page, dir } = await launchApp();
    const state = (p = page) =>
      p.evaluate(() =>
        (window as unknown as { __cruxAudio: { state: () => AudioState } }).__cruxAudio.state(),
      );
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      const dock = page.getByRole('region', { name: 'Mood Dock' });
      await expect(dock).toBeVisible({ timeout: 30_000 });
      expect((await state()).playing).toBe(false);
      expect((await state()).optIn).toBe(false);

      // Play — the gesture that unlocks audio
      await dock.getByRole('button', { name: 'Play soundscape' }).click();
      await expect.poll(async () => (await state()).playing).toBe(true);
      await expect
        .poll(async () => (await state()).contextState, { timeout: 20_000 })
        .toBe('running');
      const first = await state();
      expect(first.mixName).toBe('Dusk in the Garden');
      expect(first.layerCount).toBeGreaterThanOrEqual(3);
      expect(first.optIn).toBe(true);
      await expect(dock.getByRole('button', { name: 'Pause soundscape' })).toBeVisible();

      // Volume
      await dock.getByRole('slider', { name: 'Soundscape volume' }).fill('0.3');
      await expect.poll(async () => (await state()).volume).toBeCloseTo(0.3, 2);

      // Next mix (click the title)
      await dock.getByRole('button', { name: /Dusk in the Garden/ }).click();
      await expect.poll(async () => (await state()).mixName).toBe('Night Rain');
      await page.screenshot({ path: 'e2e/.results/resonance-1-dock.png' });

      // Collapse to the disc and back
      await dock.getByRole('button', { name: 'Collapse Mood Dock' }).click();
      await expect(dock.getByRole('button', { name: 'Expand Mood Dock' })).toBeVisible();
      await dock.getByRole('button', { name: 'Expand Mood Dock' }).click();
      await expect(dock.getByRole('button', { name: 'Pause soundscape' })).toBeVisible();

      // Restart: opt-in remembered, still on Night Rain at 0.3, resumes playing
      await app.close();
      const again = await launchApp({ dir });
      try {
        await again.page.getByRole('button', { name: /enter/i }).click();
        await expect(again.page.getByRole('region', { name: 'Mood Dock' })).toBeVisible({
          timeout: 30_000,
        });
        await expect
          .poll(async () => (await state(again.page)).playing, { timeout: 20_000 })
          .toBe(true);
        const s = await state(again.page);
        expect(s.optIn).toBe(true);
        expect(s.mixName).toBe('Night Rain');
        expect(s.volume).toBeCloseTo(0.3, 2);
      } finally {
        await again.app.close();
      }
    } finally {
      await app.close().catch(() => {});
    }
  });
});
