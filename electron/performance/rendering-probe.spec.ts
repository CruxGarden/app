import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../e2e/launch';
import { enterGarden } from '../e2e/multi-crux-helpers';

// Diagnosis only. The ordinary acceptance suite keeps the user's visual mode.
test('compare the same Home with and without the Plasma material', async () => {
  test.setTimeout(300_000);
  const out = process.env.CRUX_PERF_OUT ?? 'performance/.results';
  mkdirSync(out, { recursive: true });
  const { app, page } = await launchApp();
  const cdp = await page.context().newCDPSession(page);
  const samples: unknown[] = [];
  try {
    const gpu = await app.evaluate(async ({ app }) => ({
      features: app.getGPUFeatureStatus(),
      info: await app.getGPUInfo('basic').catch((error: Error) => ({ error: error.message })),
    }));
    writeFileSync(join(out, 'rendering-probe.json'), JSON.stringify({ gpu, samples }, null, 2));
    await cdp.send('Performance.enable');
    const sample = async (phase: string) => {
      const before = await cdp.send('Performance.getMetrics');
      const started = Date.now();
      const frames = await page.evaluate(async () => {
        const times: number[] = [];
        let previous = performance.now();
        for (let i = 0; i < 30; i++) {
          const now = await new Promise<number>(requestAnimationFrame);
          times.push(now - previous);
          previous = now;
        }
        return {
          times,
          width: innerWidth,
          height: innerHeight,
          material: document.documentElement.dataset.surfaceStyle,
        };
      });
      const after = await cdp.send('Performance.getMetrics');
      const processes = await app.evaluate(({ app }) => app.getAppMetrics());
      samples.push({ phase, elapsedMs: Date.now() - started, frames, before, after, processes });
      writeFileSync(join(out, 'rendering-probe.json'), JSON.stringify({ gpu, samples }, null, 2));
    };
    await enterGarden(page);
    await sample('ordinary');
    const original = await page.evaluate(() => {
      const root = document.documentElement;
      const prior = root.dataset.surfaceStyle;
      root.dataset.surfaceStyle = 'solid';
      document.dispatchEvent(new Event('palette-change'));
      return prior;
    });
    await expect(page.locator('canvas.plasma-ground')).toHaveCount(0);
    await sample('without-plasma');
    await page.evaluate((original) => {
      if (original) document.documentElement.dataset.surfaceStyle = original;
      else delete document.documentElement.dataset.surfaceStyle;
      document.dispatchEvent(new Event('palette-change'));
    }, original);
    await sample('restored');
  } finally {
    await cdp.detach().catch(() => {});
    await app.close();
  }
});
