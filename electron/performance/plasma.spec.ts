import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { launchApp } from '../e2e/launch';
import { enterGarden, createCrux } from '../e2e/multi-crux-helpers';

/**
 * What the Plasma theme costs, measured against Glass in the same session.
 *
 * Every plasma pass is full-viewport, so the cost follows the window, not the
 * pane count — but the pane count is what a person changes, so it is what the
 * run varies. Frames are sampled per rAF inside the page: timing screenshots
 * from outside measures the harness, and a software renderer can sit at one
 * frame a second while every screenshot still returns promptly.
 */
const SHOTS = '/private/tmp/claude-501/-Users-daniel-Workspace-CruxGarden/d02ca105-6e0a-4d59-9601-856c2d77173e/scratchpad/app-shots';
const SAMPLE_MS = 6000;

type Stats = { frames: number; fps: number; p50: number; p95: number; p99: number; worst: number; janky: number };

function stats(deltas: number[]): Stats {
  const d = deltas.slice(1).sort((a, b) => a - b); // the first delta spans the call itself
  const at = (q: number) => Math.round(d[Math.min(d.length - 1, Math.floor(d.length * q))] * 100) / 100;
  const total = d.reduce((a, b) => a + b, 0);
  return {
    frames: d.length,
    fps: Math.round((d.length / total) * 1000 * 10) / 10,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    worst: Math.round(Math.max(...d) * 100) / 100,
    // A frame over 20ms has missed 60Hz; this is the number a person feels.
    janky: Math.round((d.filter((x) => x > 20).length / d.length) * 1000) / 10,
  };
}

async function sample(page: Page, ms = SAMPLE_MS): Promise<Stats> {
  const deltas = await page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = performance.now();
        const end = last + ms;
        const tick = (t: number) => {
          out.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
  return stats(deltas);
}

async function setSurface(page: Page, style: 'plasma' | 'glass') {
  await page.evaluate((s) => {
    document.documentElement.dataset.surfaceStyle = s;
    document.dispatchEvent(new Event('palette-change'));
  }, style);
  await page.waitForTimeout(2500); // the provider mounts or tears down, then the field settles
}

test('plasma vs glass, with panes open', async () => {
  test.setTimeout(20 * 60_000);
  mkdirSync(SHOTS, { recursive: true });
  const { app, page } = await launchApp({ env: { CRUX_DEV_SERVER: 'http://localhost:8080' } });
  const report: Record<string, unknown> = { cpus: cpus().length, cpu: cpus()[0]?.model };
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await createCrux(page, 'Plasma perf');
    await page.waitForTimeout(4000);

    report.gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: dbg && gl ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
        dpr: devicePixelRatio,
      };
    });

    const open = async (label: string) => {
      const b = page.getByRole('button', { name: `Toggle ${label}`, exact: true });
      if (await b.isVisible().catch(() => false)) {
        await b.click();
        await page.waitForTimeout(500);
      }
    };

    const runs: Record<string, unknown> = {};
    const measure = async (key: string) => {
      const paneCount = await page.locator('.mosaic-window').count();
      await setSurface(page, 'plasma');
      const canvas = await page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement | null;
        return c ? { w: c.width, h: c.height } : null;
      });
      const plasma = await sample(page);
      await setSurface(page, 'glass');
      const glass = await sample(page);
      await setSurface(page, 'plasma'); // back, and re-measure to catch drift
      const plasma2 = await sample(page);
      runs[key] = { paneCount, canvas, plasma, glass, plasmaAgain: plasma2 };
      console.log(`RUN ${key} ${JSON.stringify(runs[key])}`);
    };

    await measure('panes-2');
    for (const label of ['artifacts', 'workshop']) await open(label);
    await page.waitForTimeout(1500);
    await measure('panes-4');
    for (const label of ['metadata', 'history', 'export', 'sync']) await open(label);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/20-many-panes.png` });
    await measure('panes-many');

    // The expensive path: a splitter drag reallocates nothing but makes every
    // surface spring chase a moving box, every frame.
    await setSurface(page, 'plasma');
    const split = page.locator('.mosaic-split').first();
    const box = await split.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const dragging = sample(page, 3000);
      for (let i = 0; i < 30; i++) {
        await page.mouse.move(box.x + box.width / 2 + Math.sin(i / 3) * 140, box.y + box.height / 2);
        await page.waitForTimeout(90);
      }
      runs['drag'] = { plasma: await dragging };
      await page.mouse.up();
      console.log(`RUN drag ${JSON.stringify(runs['drag'])}`);
    }

    await page.screenshot({ path: `${SHOTS}/21-after-perf.png` });
    report.runs = runs;
    writeFileSync(`${SHOTS}/plasma-perf.json`, JSON.stringify(report, null, 2));
    console.log('REPORT ' + JSON.stringify(report, null, 2));
    expect(Object.keys(runs).length).toBeGreaterThan(2);
  } finally {
    await app.close();
  }
});
