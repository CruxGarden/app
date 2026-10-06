import { test, expect } from '@playwright/test';
import { launchApp } from '../e2e/launch';
import { enterGarden } from '../e2e/multi-crux-helpers';

test('unrelated animated CSS changes do not retain background selection updates', async () => {
  const { app, page } = await launchApp({ ai: false, args: ['--mute-audio'] });
  const cdp = await page.context().newCDPSession(page);
  const animate = (count: number) =>
    page.evaluate(async (count) => {
      for (let frame = 0; frame < count; frame++) {
        document.documentElement.style.setProperty('--memory-probe', String(frame));
        // Deliver each MutationObserver batch, as ordinary animation frames do.
        await Promise.resolve();
      }
    }, count);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  try {
    await enterGarden(page);
    await animate(2000);
    const before = await heap();
    await animate(30_000);
    const growth = (await heap()) - before;
    console.log(JSON.stringify({ backgroundUpdateRetainedBytes: growth }));
    // The prior observer retained ~2.6 MB of same-value React update callbacks.
    // Allow normal bookkeeping, but not a queue proportional to frame count.
    expect(growth).toBeLessThan(1024 * 1024);
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--background-type', 'blank'),
    );
    await expect(page.locator('.bloom-background')).toHaveCount(0);
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--background-type', 'bloom'),
    );
    await expect(page.locator('.bloom-background')).toBeVisible();
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = 'html.memory-background { --background-type: blank !important; }';
      document.head.append(style);
      document.documentElement.classList.add('memory-background');
    });
    await expect(page.locator('.bloom-background')).toHaveCount(0);
    await page.evaluate(() => document.documentElement.classList.remove('memory-background'));
    await expect(page.locator('.bloom-background')).toBeVisible();
    // A rapid return to the prior selection must also be observed.
    await page.evaluate(async () => {
      document.documentElement.style.setProperty('--background-type', 'blank');
      await Promise.resolve();
      document.documentElement.style.setProperty('--background-type', 'bloom');
    });
    await expect(page.locator('.bloom-background')).toBeVisible();
  } finally {
    await cdp.detach();
    await app.close();
  }
});
