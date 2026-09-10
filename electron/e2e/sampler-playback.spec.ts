import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

for (const cancel of ['Stop', 'Ask agent', 'Repeated Play then Stop'] as const)
  test(`${cancel} cancels pending sampler playback while samples load`, async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    let release!: () => void;
    const loading = new Promise<void>((resolve) => (release = resolve));
    let requests = 0;
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.screenshot({
        path: test.info().outputPath('creation.png'),
        animations: 'disabled',
      });
      await page.getByRole('button', { name: /^Sample sequencer/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const frame = page.frameLocator('iframe[data-crux-id]');
      await expect(frame.locator('#save-state')).toHaveText('Saved in this Crux');
      await page.context().route(/\/samples\/[^/]+\.wav$/, async (route) => {
        requests++;
        await loading;
        await route.continue();
      });
      // Observe completion of the actual click handler, including delayed decoding.
      await frame.locator('#play').evaluate((button: HTMLButtonElement) => {
        const play = button.onclick!;
        const attempts: unknown[] = [];
        Object.assign(window, { pendingSamplerPlays: attempts });
        button.onclick = function (event) {
          const pending = play.call(this, event);
          attempts.push(pending);
          return pending;
        };
      });
      await frame.getByRole('button', { name: 'Play pattern', exact: true }).click();
      await expect.poll(() => requests).toBe(4);
      if (cancel === 'Repeated Play then Stop')
        await frame.getByRole('button', { name: 'Play pattern', exact: true }).click();
      if (cancel === 'Ask agent')
        await page.getByRole('button', { name: 'Ask agent', exact: true }).click();
      else await frame.getByRole('button', { name: 'Stop', exact: true }).click();
      release();
      await frame.locator('#play').evaluate(async () => {
        await Promise.all(
          (window as unknown as { pendingSamplerPlays: Promise<void>[] }).pendingSamplerPlays,
        );
      });
      await expect(frame.locator('#playing')).toHaveText('Silent');
      await expect(frame.locator('#meter')).toHaveJSProperty('value', 0);
      await expect(frame.locator('#error')).toBeHidden();
      // Cancellation must leave the instrument usable without reloading it.
      await frame.getByRole('button', { name: 'Play pattern', exact: true }).click();
      await expect(frame.locator('#playing')).toHaveText('Playing through smplr');
      await expect
        .poll(async () => Number(await frame.locator('#meter').getAttribute('data-peak')))
        .toBeGreaterThan(0.00001);
      await frame.getByRole('button', { name: 'Stop', exact: true }).click();
      await expect(frame.locator('#playing')).toHaveText('Silent');
    } finally {
      release();
      await app.close();
    }
  });
