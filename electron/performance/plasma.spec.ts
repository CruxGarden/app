import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { launchApp } from '../e2e/launch';
import { enterGarden, createCrux } from '../e2e/multi-crux-helpers';

/**
 * What the Plasma theme costs.
 *
 * Every plasma pass is full-viewport, so cost follows the canvas and the
 * machine — not the pane count, which is the thing a person actually changes.
 * The suite varies both anyway, because "does it still hold up with the whole
 * workspace open" is the question people ask.
 *
 * Frames are sampled per rAF inside the page. Timing from outside measures
 * the harness, and a software renderer can sit at one frame a second while
 * every screenshot still returns promptly.
 *
 * Two things make raw frame times hard to read on a fast machine:
 *
 *  - vsync. A display that refreshes at 120Hz reports 8.3ms whether the frame
 *    took 1ms or 8. "No dropped frames" is all a frame time can tell you.
 *  - an idle app. The material competes with React, Monaco and a streaming
 *    reply for the same 8.3ms, and idle measurements never see that.
 *
 * So the suite answers those separately: `headroom` raises quality until
 * frames actually break, which turns "fast enough" into a multiplier — how
 * many times slower a GPU can be before this drops frames. And `load` runs
 * the same measurement with the app busy.
 *
 *   npm run test:performance -- performance/plasma.spec.ts
 *
 * Needs the dev server on :8080 (npx vite --port 8080) so it measures the
 * working tree rather than whatever was last built into app/dist.
 */
const SHOTS =
  process.env.CRUX_PERF_OUT ??
  '/private/tmp/claude-501/-Users-daniel-Workspace-CruxGarden/d02ca105-6e0a-4d59-9601-856c2d77173e/scratchpad/app-shots';
const SAMPLE_MS = 5000;
const TIERS = ['low', 'medium', 'high', 'ultra'] as const;

type Stats = {
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  worst: number;
  /** Percentage of frames over 20ms — the ones a person feels. */
  janky: number;
  /** Longest main-thread task seen while sampling. */
  longestTask: number;
};

function summarise(deltas: number[], longestTask: number): Stats {
  const d = deltas.slice(1).sort((a, b) => a - b); // the first delta spans the call itself
  const at = (q: number) =>
    Math.round((d[Math.min(d.length - 1, Math.floor(d.length * q))] ?? 0) * 100) / 100;
  const total = d.reduce((a, b) => a + b, 0);
  return {
    frames: d.length,
    fps: Math.round((d.length / total) * 1000 * 10) / 10,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    worst: Math.round(Math.max(...d) * 100) / 100,
    janky: Math.round((d.filter((x) => x > 20).length / d.length) * 1000) / 10,
    longestTask: Math.round(longestTask * 100) / 100,
  };
}

async function sample(page: Page, ms = SAMPLE_MS): Promise<Stats> {
  const { deltas, longestTask } = await page.evaluate(
    (ms) =>
      new Promise<{ deltas: number[]; longestTask: number }>((resolve) => {
        const out: number[] = [];
        let longestTask = 0;
        let obs: PerformanceObserver | undefined;
        try {
          obs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) longestTask = Math.max(longestTask, e.duration);
          });
          obs.observe({ entryTypes: ['longtask'] });
        } catch {
          /* longtask is not everywhere; the frame times still stand on their own */
        }
        let last = performance.now();
        const end = last + ms;
        const tick = (t: number) => {
          out.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(tick);
          else {
            obs?.disconnect();
            resolve({ deltas: out, longestTask });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
  return summarise(deltas, longestTask);
}

async function setSurface(page: Page, style: 'plasma' | 'glass') {
  await page.evaluate((s) => {
    document.documentElement.dataset.surfaceStyle = s;
    document.dispatchEvent(new Event('palette-change'));
  }, style);
  await page.waitForTimeout(2500); // the provider mounts or tears down, then the field settles
}

async function setTier(page: Page, tier: string) {
  await page.evaluate((t) => {
    document.documentElement.dataset.plasmaTier = t;
    document.dispatchEvent(new Event('palette-change'));
  }, tier);
  await page.waitForTimeout(2000); // a tier change re-reads quality and reallocates every target
}

/** Canvas pixels the material is actually drawing, which is what the cost follows. */
async function canvasPixels(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    return c
      ? { w: c.width, h: c.height, megapixels: Math.round((c.width * c.height) / 1e4) / 100 }
      : null;
  });
}

/** Open every pane the toolbar offers, one at a time, reporting the count each time. */
async function openAllPanes(page: Page): Promise<string[]> {
  const opened: string[] = [];
  const toggles = await page.getByRole('button', { name: /^Toggle / }).all();
  for (const t of toggles) {
    const name = (await t.getAttribute('aria-label')) ?? '';
    if (!(await t.isVisible().catch(() => false))) continue;
    await t.click().catch(() => {});
    await page.waitForTimeout(400);
    opened.push(name);
  }
  return opened;
}

test('plasma: tiers, panes, load and headroom', async () => {
  test.setTimeout(30 * 60_000);
  mkdirSync(SHOTS, { recursive: true });
  const { app, page } = await launchApp({
    env: { CRUX_DEV_SERVER: 'http://localhost:8080', CRUX_AI_MOCK: '1' },
    // Without this the window reports devicePixelRatio 1, the renderer's
    // min(dpr, quality) pins every tier to the same canvas, and the whole
    // sweep measures nothing. A real laptop screen is 2.
    args: ['--force-device-scale-factor=2'],
  });
  const report: Record<string, unknown> = {
    when: new Date().toISOString(),
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    memGB: Math.round(totalmem() / 1e9),
  };
  const runs: Record<string, unknown> = {};
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await createCrux(page, 'Plasma perf');
    await page.waitForTimeout(4000);

    report.display = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: dbg && gl ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) : 'unknown',
        dpr: devicePixelRatio,
      };
    });

    // ── 1. Glass as the baseline, at the pane count people will run ──────
    await setSurface(page, 'glass');
    runs['glass/2-panes'] = { panes: 2, ...(await sample(page)) };

    // ── 2. Every tier, two panes ─────────────────────────────────────────
    await setSurface(page, 'plasma');
    for (const tier of TIERS) {
      await setTier(page, tier);
      runs[`plasma-${tier}/2-panes`] = {
        panes: 2,
        canvas: await canvasPixels(page),
        ...(await sample(page)),
      };
    }

    // ── 3. Busy app: a streaming reply and typing, at the default tier ───
    // Before the workspace is filled: past a few panes each one is too narrow
    // to show its contents, and the composer this types into is not rendered.
    await setTier(page, 'high');
    const composer = page.getByTestId('pane-body-collaboration').locator('textarea');
    if (await composer.isVisible().catch(() => false)) {
      await composer.fill('Tell me about this crux, at length.');
      const busy = sample(page, SAMPLE_MS);
      await page.keyboard.press('Enter');
      // Keep the main thread working the whole time the material is drawing:
      // React commits per streamed chunk, and each keystroke is another commit.
      for (let i = 0; i < 40; i++) {
        await composer.type('x', { delay: 0 }).catch(() => {});
        await page.waitForTimeout(100);
      }
      runs['plasma-high/2-panes/streaming+typing'] = { panes: 2, ...(await busy) };
      await composer.fill('');
    } else {
      runs['plasma-high/2-panes/streaming+typing'] = { skipped: 'no composer visible' };
    }

    // ── 4. The whole workspace open, at the default tier and at ultra ────
    await setTier(page, 'high');
    const opened = await openAllPanes(page);
    await page.waitForTimeout(2000);
    const panes = await page.locator('.mosaic-window').count();
    report.panesOpened = { attempted: opened.length, visible: panes };
    await page.screenshot({ path: `${SHOTS}/30-all-panes.png` });

    runs[`plasma-high/${panes}-panes`] = {
      panes,
      canvas: await canvasPixels(page),
      ...(await sample(page)),
    };
    await setTier(page, 'ultra');
    runs[`plasma-ultra/${panes}-panes`] = {
      panes,
      canvas: await canvasPixels(page),
      ...(await sample(page)),
    };
    await setSurface(page, 'glass');
    runs[`glass/${panes}-panes`] = { panes, ...(await sample(page)) };

    await setSurface(page, 'plasma');
    await setTier(page, 'high');

    // ── 5. A splitter drag: every surface spring chasing a moving box ────
    const split = page.locator('.mosaic-split').first();
    const sb = await split.boundingBox();
    if (sb) {
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
      await page.mouse.down();
      const dragging = sample(page, 3000);
      for (let i = 0; i < 30; i++) {
        await page.mouse.move(sb.x + sb.width / 2 + Math.sin(i / 3) * 140, sb.y + sb.height / 2);
        await page.waitForTimeout(90);
      }
      runs[`plasma-high/${panes}-panes/splitter-drag`] = { panes, ...(await dragging) };
      await page.mouse.up();
      await page.waitForTimeout(1500);
    }

    // ── 6. Headroom: raise the pixel count until frames actually break ───
    // vsync hides everything below the budget, so the useful number is how
    // much harder this machine can be pushed before it misses a frame. Each
    // step is a real quality value; the multiplier is in pixels, which is
    // what the GPU pays for.
    await setTier(page, 'high');
    const basePixels = (await canvasPixels(page))!.megapixels;
    const headroom: Record<string, unknown>[] = [];
    let broke: number | null = null;
    for (const quality of [1.25, 1.75, 2.25, 3, 4, 6]) {
      const applied = await page.evaluate((q) => {
        // No tier goes this high, so reach the renderer directly (PlasmaSurfaces
        // parks it on window in dev) and configure() the quality up.
        const r = (
          window as unknown as {
            __plasmaRenderer?: {
              settings: Record<string, unknown>;
              configure: (s: unknown) => void;
            };
          }
        ).__plasmaRenderer;
        if (!r) return false;
        r.configure({ ...r.settings, quality: q });
        return true;
      }, quality);
      if (!applied) {
        headroom.push({ quality, skipped: 'renderer not reachable — is this a dev build?' });
        break;
      }
      await page.waitForTimeout(2500);
      const px = await canvasPixels(page);
      const s = await sample(page, 3000);
      const ratio = px ? Math.round((px.megapixels / basePixels) * 100) / 100 : null;
      headroom.push({ quality, canvas: px, ratio, ...s });
      if (s.janky > 1 || s.p95 > 20) {
        broke = quality;
        break;
      }
      // The renderer clamps to MAX_PIXELS (2.6MP) on its own, so past the
      // point where the canvas stops growing there is nothing left to raise.
      if (headroom.length > 1 && ratio === headroom[headroom.length - 2]?.ratio) break;
    }
    runs['headroom'] = {
      basePixels,
      steps: headroom,
      brokeAt: broke,
      note: broke
        ? undefined
        : 'never broke — the renderer clamps its own canvas at MAX_PIXELS (2.6 megapixels), so this is the whole workload, not a sample of it',
    };

    await page.screenshot({ path: `${SHOTS}/31-perf-end.png` });
    report.runs = runs;
    writeFileSync(`${SHOTS}/plasma-perf.json`, JSON.stringify(report, null, 2));
    for (const [k, v] of Object.entries(runs)) console.log(`RUN ${k} ${JSON.stringify(v)}`);
    console.log('MACHINE ' + JSON.stringify({ cpu: report.cpu, display: report.display }));
    expect(Object.keys(runs).length).toBeGreaterThan(5);
  } finally {
    await app.close();
  }
});
