import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { launchApp } from '../e2e/launch';
import { enterGarden, createCrux } from '../e2e/multi-crux-helpers';

/**
 * What opening a Crux into the builder costs while its panes arrive.
 *
 * Daniel (2026-09-19): "a bit of performance issues when loading a crux into
 * the builder, with multiple panes animating in … a bit stuttery". Frames
 * are sampled per rAF inside the page from the moment the card is clicked
 * until the panes have formed, under plasma and under glass, so the material's
 * share of the stutter is separable from React's. The form-in is timed from
 * the first `data-plasma-forming` to the last one clearing.
 *
 *   CRUX_DEV_SERVER=http://localhost:8080 npm run test:performance -- performance/builder-open.spec.ts
 */
const OUT = process.env.CRUX_PERF_OUT ?? 'performance/.results';
const WINDOW_MS = 3000;

type Stats = {
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  worst: number;
  janky: number;
  longestTask: number;
  formMs: number | null;
  surfaces: number | null;
};

test('opening a crux: frames while the panes arrive, plasma vs glass', async () => {
  test.setTimeout(10 * 60_000);
  const { app, page } = await launchApp({
    env: { CRUX_DEV_SERVER: 'http://localhost:8080', CRUX_AI_MOCK: '1' },
  });
  const results: Record<string, Stats[]> = {};
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await createCrux(page, 'Builder perf');
    const home = async () => {
      await page.locator('header').getByRole('button').first().click();
      await page.getByRole('button', { name: 'Add Crux' }).waitFor();
    };
    await home();
    // A second Crux with real content: the Notes template, so the Workshop
    // loads an app in an iframe and Artifacts has files — and a third, the
    // Mermaid Live Editor with the Metadata pane open too, the shape of the
    // Crux Daniel saw stutter.
    const fromTemplate = async (pattern: RegExp, name: string) => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: pattern }).click();
      await page.locator('[data-modal-open] input').first().fill(name);
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.locator('[data-workspace-id]').first().waitFor();
      await page.waitForTimeout(2500);
    };
    await fromTemplate(/^Notes/, 'Notes perf');
    await home();
    await fromTemplate(/^Mermaid/, 'Mermaid perf');
    await page.getByRole('button', { name: 'Toggle metadata' }).click();
    await page.waitForTimeout(1500);
    await home();

    const cases = [
      { key: 'plasma · blank · wait', style: 'plasma', crux: 'Builder perf', wait: true },
      { key: 'plasma · Notes · wait', style: 'plasma', crux: 'Notes perf', wait: true },
      {
        key: 'plasma · Mermaid+Metadata · wait',
        style: 'plasma',
        crux: 'Mermaid perf',
        wait: true,
      },
      {
        key: 'plasma · Mermaid+Metadata · no wait',
        style: 'plasma',
        crux: 'Mermaid perf',
        wait: false,
      },
      { key: 'glass · Mermaid+Metadata', style: 'glass', crux: 'Mermaid perf', wait: true },
    ] as const;
    for (const { key, style, crux, wait } of cases) {
      await page.evaluate(
        ([s, w]) => {
          document.documentElement.dataset.surfaceStyle = s;
          if (w) delete document.documentElement.dataset.plasmaWait;
          else document.documentElement.dataset.plasmaWait = 'off';
          document.dispatchEvent(new Event('palette-change'));
        },
        [style, wait] as const,
      );
      await page.waitForTimeout(2500);
      results[key] ??= [];
      for (let round = 0; round < 3; round++) {
        // Arm the sampler, then click; the sampler resolves on its own clock.
        const armed = page.evaluate(
          (ms) =>
            new Promise<{
              deltas: number[];
              longestTask: number;
              formMs: number | null;
              surfaces: number | null;
            }>((resolve) => {
              const out: number[] = [];
              let longestTask = 0;
              let obs: PerformanceObserver | undefined;
              try {
                obs = new PerformanceObserver((list) => {
                  for (const e of list.getEntries())
                    longestTask = Math.max(longestTask, e.duration);
                });
                obs.observe({ entryTypes: ['longtask'] });
              } catch {
                /* frame times stand on their own */
              }
              let firstForm: number | null = null;
              let lastClear: number | null = null;
              const forming = () => document.querySelectorAll('[data-plasma-forming]').length;
              let seen = false;
              const last0 = performance.now();
              let last = last0;
              const end = last0 + ms;
              const tick = (t: number) => {
                out.push(t - last);
                last = t;
                const n = forming();
                if (n > 0 && firstForm === null) firstForm = t;
                if (n > 0) seen = true;
                if (seen && n === 0 && lastClear === null) lastClear = t;
                if (t < end) requestAnimationFrame(tick);
                else {
                  obs?.disconnect();
                  const r = (
                    window as unknown as { __plasmaRenderer?: { recs: Map<number, unknown> } }
                  ).__plasmaRenderer;
                  resolve({
                    deltas: out,
                    longestTask,
                    formMs: firstForm !== null && lastClear !== null ? lastClear - firstForm : null,
                    surfaces: r ? r.recs.size : null,
                  });
                }
              };
              requestAnimationFrame(tick);
            }),
          WINDOW_MS,
        );
        await page.waitForTimeout(50);
        await page.getByRole('button', { name: `Open ${crux}` }).click();
        const raw = await armed;
        const d = raw.deltas.slice(1).sort((a, b) => a - b);
        const at = (q: number) =>
          Math.round((d[Math.min(d.length - 1, Math.floor(d.length * q))] ?? 0) * 100) / 100;
        const total = d.reduce((a, b) => a + b, 0);
        results[key].push({
          frames: d.length,
          fps: Math.round((d.length / total) * 1000 * 10) / 10,
          p50: at(0.5),
          p95: at(0.95),
          worst: Math.round(Math.max(...d) * 100) / 100,
          janky: Math.round((d.filter((x) => x > 20).length / d.length) * 1000) / 10,
          longestTask: Math.round(raw.longestTask * 100) / 100,
          formMs: raw.formMs === null ? null : Math.round(raw.formMs),
          surfaces: raw.surfaces,
        });
        await page.locator('[data-workspace-id]').first().waitFor();
        await home();
        await page.waitForTimeout(800);
      }
    }
  } finally {
    await app.close();
  }
  const report = {
    at: new Date().toISOString(),
    machine: {
      cpus: cpus().length,
      model: cpus()[0]?.model,
      memGb: Math.round(totalmem() / 2 ** 30),
    },
    windowMs: WINDOW_MS,
    results,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/builder-open.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 1));
});
