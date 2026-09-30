import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../e2e/launch';
import { enterGarden } from '../e2e/multi-crux-helpers';
import { showPane, hidePane } from '../e2e/panel-helpers';

test('audio does not resend unchanged appearance and font buffers to Notes', async () => {
  const { app, page } = await launchApp({ sound: true, args: ['--mute-audio'] });
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Appearance traffic');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('html')).toHaveAttribute('data-garden-mood', 'true');
    await showPane(page, 'Mood');
    await page.getByRole('button', { name: 'Sound', exact: true }).click();
    await page.getByRole('button', { name: 'Play synth', exact: true }).click();
    await hidePane(page, 'Mood');
    await page.waitForTimeout(1000);
    await frame.locator('html').evaluate((el) => {
      el.dataset.updates = '0';
      el.dataset.fontBytes = '0';
      window.addEventListener('message', (event) => {
        if (event.data?.type !== 'crux:appearance:update') return;
        el.dataset.updates = String(Number(el.dataset.updates) + 1);
        el.dataset.fontBytes = String(
          Number(el.dataset.fontBytes) +
            event.data.appearance.fonts.reduce(
              (sum: number, f: { data: ArrayBuffer }) => sum + f.data.byteLength,
              0,
            ),
        );
      });
    });
    await page.waitForTimeout(5000);
    const observed = await frame.locator('html').evaluate((el) => ({
      updates: Number(el.dataset.updates),
      fontBytes: Number(el.dataset.fontBytes),
    }));
    const out = process.env.CRUX_PERF_OUT ?? 'performance/.results';
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'appearance-traffic.json'), JSON.stringify(observed, null, 2));
    console.log(JSON.stringify(observed));
    expect(
      observed.updates,
      'unchanged theme must not be retransmitted with every audio tick',
    ).toBeLessThanOrEqual(1);
    // A real token change still reaches the existing frame.
    await page.evaluate(() => document.documentElement.style.setProperty('--bg', '#123456'));
    await expect
      .poll(() =>
        frame
          .locator('html')
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--app-bg').trim()),
      )
      .toBe('#123456');
  } finally {
    await app.close();
  }
});
