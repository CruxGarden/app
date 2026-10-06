import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../e2e/launch';
import { enterGarden } from '../e2e/multi-crux-helpers';

// Each launch starts a new process. Filesystem caches are deliberately not
// purged: these are process-cold measurements, not OS/disk-cold claims.
test('fresh-profile startup and existing-Garden restart', async () => {
  const out = process.env.CRUX_PERF_OUT ?? 'performance/.results';
  mkdirSync(out, { recursive: true });
  const results: unknown[] = [];
  for (let trial = 0; trial < 3; trial++) {
    let dir: string | undefined;
    for (const mode of ['fresh', 'restart']) {
      const start = Date.now();
      const instance = await launchApp({ dir, ai: false, args: ['--mute-audio'] });
      dir = instance.dir;
      try {
        const { page, app } = instance;
        await expect(page.getByRole('button', { name: /enter/i })).toBeVisible();
        const gatewayMs = Date.now() - start;
        const enter = Date.now();
        if (mode === 'fresh') await enterGarden(page);
        else {
          await page.getByRole('button', { name: /enter/i }).click();
          await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
        }
        const gardenMs = Date.now() - enter;
        const runtime = await app.evaluate(({ app }) => ({
          packaged: app.isPackaged,
          processes: app.getAppMetrics().map((p) => ({
            type: p.type,
            workingSetKB: p.memory.workingSetSize,
          })),
        }));
        results.push({ trial, mode, gatewayMs, gardenMs, ...runtime });
        console.log(JSON.stringify(results.at(-1)));
        writeFileSync(join(out, 'startup.json'), JSON.stringify(results, null, 2));
      } finally {
        await instance.app.close();
      }
    }
  }
});
