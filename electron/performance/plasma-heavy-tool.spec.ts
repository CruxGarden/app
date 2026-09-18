import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { launchApp } from '../e2e/launch';
import { enterGarden } from '../e2e/multi-crux-helpers';

/**
 * The Plasma material with a real tool running in the workspace.
 *
 * The idle measurements say the material never misses a frame; they do not
 * say what happens when something else wants the GPU. GDevelop is the honest
 * worst case in this app: a full game editor in an iframe, with its own WebGL
 * context, its own render loop and a large React tree — two things competing
 * for one GPU and one main thread.
 *
 * The comparison that matters is Plasma against Glass with the same editor
 * open, in the same session. An absolute frame time here means little; the
 * difference between the two themes is the number that decides whether the
 * theme can be the default.
 *
 *   npx vite build                # in app/ — this one runs against dist/
 *   npm run test:performance -- performance/plasma-heavy-tool.spec.ts
 *
 * Needs gdevelop-crux built (npm run build:gdevelop). It is a long build; the
 * test says so and stops rather than timing out somewhere confusing.
 */
const SHOTS =
  process.env.CRUX_PERF_OUT ??
  '/private/tmp/claude-501/-Users-daniel-Workspace-CruxGarden/d02ca105-6e0a-4d59-9601-856c2d77173e/scratchpad/app-shots';
const SAMPLE_MS = 6000;

type Stats = {
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  worst: number;
  janky: number;
  longestTask: number;
};

function summarise(deltas: number[], longestTask: number): Stats {
  const d = deltas.slice(1).sort((a, b) => a - b);
  const at = (q: number) => Math.round(d[Math.min(d.length - 1, Math.floor(d.length * q))] * 100) / 100;
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

/** Sampled in the host page: the plasma canvas and the app's own React live here. */
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
          /* not everywhere; frame times still stand on their own */
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
  await page.waitForTimeout(3000);
}

async function setTier(page: Page, tier: string) {
  await page.evaluate((t) => {
    document.documentElement.dataset.plasmaTier = t;
    document.dispatchEvent(new Event('palette-change'));
  }, tier);
  await page.waitForTimeout(2000);
}

test('plasma with GDevelop open', async () => {
  test.setTimeout(30 * 60_000);
  mkdirSync(SHOTS, { recursive: true });
  // Against the built app, not the dev server: the GDevelop template globs the
  // whole gdevelop-crux tree as URL imports, which Vite serves as thousands of
  // separate requests and cannot deliver inside one dynamic import. Run
  // `npm run build` (or `npx vite build`) first. It is also the more honest
  // measurement — this is the code that ships.
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const runs: Record<string, unknown> = {};
  const report: Record<string, unknown> = { when: new Date().toISOString(), cpu: cpus()[0]?.model };
  try {
    await page.setViewportSize({ width: 1800, height: 1100 });
    // Keep the editor offline: it reaches for asset stores and login, and a
    // network round trip in the middle of a measurement is noise.
    await page
      .context()
      .route(/^https?:\/\//, (route) =>
        ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      );

    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    const gdevelop = page.getByRole('button', { name: /^GDevelop/ });
    await expect(gdevelop, 'GDevelop template missing — is gdevelop-crux built?').toBeVisible({
      timeout: 30_000,
    });
    await gdevelop.click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // The editor is a large app: wait for it to say it has settled, not for a timer.
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 240_000,
    });
    await page.waitForTimeout(6000); // let its first frames and layout settle
    await page.screenshot({ path: `${SHOTS}/40-gdevelop-plasma.png` });

    report.editor = await page.evaluate(() => ({
      iframes: document.querySelectorAll('iframe[data-crux-id]').length,
      canvases: document.querySelectorAll('canvas').length,
    }));

    // Idle, with the editor loaded, at each tier and against Glass.
    await setSurface(page, 'plasma');
    for (const tier of ['low', 'high', 'ultra']) {
      await setTier(page, tier);
      runs[`plasma-${tier}/gdevelop-idle`] = await sample(page);
    }
    await setSurface(page, 'glass');
    runs['glass/gdevelop-idle'] = await sample(page);

    // Working in the editor: opening panels and dragging in its canvas is
    // what actually drives its own render loop.
    await setSurface(page, 'plasma');
    await setTier(page, 'high');
    const busy = sample(page, SAMPLE_MS);
    for (let i = 0; i < 12; i++) {
      await frame
        .getByRole('button', { name: 'Add object', exact: true })
        .click({ timeout: 4000 })
        .catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.mouse.move(900 + i * 12, 600 + (i % 5) * 20);
      await page.waitForTimeout(350);
    }
    runs['plasma-high/gdevelop-working'] = await busy;

    await setSurface(page, 'glass');
    const busyGlass = sample(page, SAMPLE_MS);
    for (let i = 0; i < 12; i++) {
      await frame
        .getByRole('button', { name: 'Add object', exact: true })
        .click({ timeout: 4000 })
        .catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.mouse.move(900 + i * 12, 600 + (i % 5) * 20);
      await page.waitForTimeout(350);
    }
    runs['glass/gdevelop-working'] = await busyGlass;

    // Glass has been second in every pair so far, and second is the warmer,
    // more loaded slot — so a difference in its favour would be trustworthy
    // and a difference against it would not. Run the same thing once more with
    // Plasma last; if the gap survives the swap it is the theme, not the order.
    await setSurface(page, 'plasma');
    await setTier(page, 'high');
    const busyAgain = sample(page, SAMPLE_MS);
    for (let i = 0; i < 12; i++) {
      await frame
        .getByRole('button', { name: 'Add object', exact: true })
        .click({ timeout: 4000 })
        .catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.mouse.move(900 + i * 12, 600 + (i % 5) * 20);
      await page.waitForTimeout(350);
    }
    runs['plasma-high/gdevelop-working (order reversed)'] = await busyAgain;

    await page.screenshot({ path: `${SHOTS}/41-gdevelop-end.png` });
    report.runs = runs;
    writeFileSync(`${SHOTS}/plasma-heavy-tool.json`, JSON.stringify(report, null, 2));
    for (const [k, v] of Object.entries(runs)) console.log(`RUN ${k} ${JSON.stringify(v)}`);
    console.log('MACHINE ' + JSON.stringify({ cpu: report.cpu, editor: report.editor }));
    expect(Object.keys(runs).length).toBeGreaterThan(3);
  } finally {
    await app.close();
  }
});
