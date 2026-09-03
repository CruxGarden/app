import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

type AudioState = { playing: boolean; mixName: string | null; layerCount: number };

/** Phase 2: the Resonance tab edits the live Mix — add a layer, gain, mute, rename — and it persists. */
test.describe('resonance mixer', () => {
  test.setTimeout(150_000);

  test('add a layer, edit it, rename the mix, survive a restart', async () => {
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
      await dock.getByRole('button', { name: 'Play soundscape' }).click();
      await expect.poll(async () => (await state()).playing).toBe(true);

      // Dock → Mood Builder lands on Resonance
      await dock.getByRole('button', { name: 'Open the mixer' }).click();
      await expect(page.getByRole('heading', { name: 'Mood Builder' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Mix name' })).toHaveValue(
        'Dusk in the Garden',
      );
      expect((await state()).layerCount).toBe(4);

      // Add wind, turn it down, mute it
      await page.getByRole('button', { name: '+ Wind' }).click();
      await expect.poll(async () => (await state()).layerCount).toBe(5);
      await page.getByRole('slider', { name: 'Wind gain' }).fill('-30');
      await page.getByRole('button', { name: 'Mute Wind' }).click();
      await expect(page.getByRole('button', { name: 'Mute Wind' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      // Open its settings, change strength, add a filter effect
      await page.getByRole('button', { name: 'Wind settings' }).click();
      await page.getByRole('slider', { name: 'Wind Strength' }).fill('0.9');
      await page.getByRole('combobox', { name: 'Add effect to Wind' }).selectOption('filter');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: 'Wind Filter enabled' })).toBeChecked();

      // Rename the mix — the Dock follows
      const name = page.getByRole('textbox', { name: 'Mix name' });
      await name.fill('Dusk, Windy');
      await expect.poll(async () => (await state()).mixName).toBe('Dusk, Windy');
      await page.screenshot({ path: 'e2e/.results/mixer-1-tab.png' });

      // Undo the rename
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect.poll(async () => (await state()).mixName).not.toBe('Dusk, Windy');
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await expect.poll(async () => (await state()).mixName).toBe('Dusk, Windy');

      // Restart: the edited mix is what plays
      await app.close();
      const again = await launchApp({ dir });
      try {
        await again.page.getByRole('button', { name: /enter/i }).click();
        await expect(again.page.getByRole('region', { name: 'Mood Dock' })).toBeVisible({
          timeout: 30_000,
        });
        await expect
          .poll(async () => (await state(again.page)).mixName, { timeout: 20_000 })
          .toBe('Dusk, Windy');
        expect((await state(again.page)).layerCount).toBe(5);
      } finally {
        await again.app.close();
      }
    } finally {
      await app.close().catch(() => {});
    }
  });
});
