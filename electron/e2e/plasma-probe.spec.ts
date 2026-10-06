import { test } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * A quick look under Plasma, for whichever question the day has: computed
 * styles of one surface, a screenshot, and every shape the material is
 * drawing with the element it belongs to. Dev only (reads __plasmaRenderer).
 */
test('plasma probe', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp();
  const shapes = () =>
    page.evaluate(() => {
      const r = (
        window as unknown as { __plasmaRenderer?: { recs: Map<number, { el: HTMLElement }> } }
      ).__plasmaRenderer;
      if (!r) return ['no renderer'];
      return [...r.recs.values()].map((rec) => {
        const b = rec.el.getBoundingClientRect();
        return `${rec.el.tagName}.${rec.el.className.toString().slice(0, 50)} @${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)} connected=${rec.el.isConnected}`;
      });
    });
  const go = async (path: string) => {
    await page.evaluate((p) => window.history.pushState({}, '', p), path);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await page.waitForTimeout(2500);
  };
  try {
    await page.setViewportSize({ width: 1500, height: 950 });
    await enterGarden(page);
    await page.waitForTimeout(1500);
    console.log('HOME ' + JSON.stringify(await shapes(), null, 1));
    await go('/explore');
    console.log('EXPLORE ' + JSON.stringify(await shapes(), null, 1));
    await page.screenshot({
      path: `${process.env.CRUX_PROBE_DIR ?? 'e2e/.results'}/probe-explore.png`,
    });
    await go('/nowhere-at-all');
    console.log('NOWHERE ' + JSON.stringify(await shapes(), null, 1));
    await page.screenshot({
      path: `${process.env.CRUX_PROBE_DIR ?? 'e2e/.results'}/probe-nowhere.png`,
    });
  } finally {
    await app.close();
  }
});
