import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../e2e/launch';
import { enterGarden, createCrux, switchCrux } from '../e2e/multi-crux-helpers';
import { showPane, hidePane, openPanel, chooseSettingsSection } from '../e2e/panel-helpers';

// Ordinary production behavior: no CSS/audio/cleanup overrides. Forced GC at
// checkpoints separates retained JS objects from transient allocation; RSS is
// reported separately and is not interpreted as a precise JS leak measurement.
test('sustained sound and workspace switching release closed workspaces', async () => {
  const cycles = Number(process.env.CRUX_MEMORY_CYCLES ?? 12);
  const dwell = Number(process.env.CRUX_MEMORY_DWELL_MS ?? 5000);
  test.setTimeout(120_000 + cycles * (dwell + 10_000));
  const out = process.env.CRUX_PERF_OUT ?? 'performance/.results';
  mkdirSync(out, { recursive: true });
  const { app, page } = await launchApp({ sound: true, ai: false, args: ['--mute-audio'] });
  const samples: unknown[] = [];
  const startedAt = Date.now();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const sample = async (phase: string, actionMs = 0) => {
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const dom = await cdp.send('Memory.getDOMCounters');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const processes = await app.evaluate(({ app }) =>
      app.getAppMetrics().map((p) => ({
        type: p.type,
        pid: p.pid,
        workingSetKB: p.memory.workingSetSize,
        cpu: p.cpu.percentCPUUsage,
      })),
    );
    const value = {
      phase,
      elapsedMs: Date.now() - startedAt,
      actionMs,
      heap,
      dom,
      metrics,
      processes,
    };
    samples.push(value);
    console.log(JSON.stringify({ phase, actionMs, heap: heap.usedSize, ...dom }));
    writeFileSync(join(out, 'workspace-memory.json'), JSON.stringify({ samples, errors }, null, 2));
    return value;
  };
  try {
    await enterGarden(page);
    const settings = await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'AI and agents');
    await settings.getByRole('button', { name: 'AI', exact: true }).click();
    const aiSwitch = settings.getByRole('switch', { name: 'Enable AI Tools' });
    await expect(aiSwitch).toHaveAttribute('aria-checked', 'false');
    await aiSwitch.click();
    await hidePane(page, 'Settings');
    for (const name of ['Memory A', 'Memory B', 'Memory C']) {
      await createCrux(page, name);
      await openPanel(page, 'collaboration', 'Toggle collaboration');
      await page.getByPlaceholder('Send a message...').fill(`Draft for ${name}`);
    }
    await showPane(page, 'Mood');
    await page.getByRole('button', { name: 'Sound', exact: true }).click();
    await page.getByRole('button', { name: 'Play synth', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __cruxAudio: { state(): { level: number } };
              }
            ).__cruxAudio.state().level,
        ),
      )
      .toBeGreaterThan(0.005);
    await hidePane(page, 'Mood');
    await sample('warm');
    for (let cycle = 0; cycle < cycles; cycle++) {
      const start = Date.now();
      const name = ['Memory A', 'Memory B', 'Memory C'][cycle % 3]!;
      await switchCrux(page, name);
      await expect(page.getByPlaceholder('Send a message...')).toHaveValue(`Draft for ${name}`);
      const actionMs = Date.now() - start;
      await page.waitForTimeout(dwell);
      await sample(`cycle-${cycle}`, actionMs);
    }
    await showPane(page, 'Mood');
    await page.getByRole('button', { name: 'Sound', exact: true }).click();
    await page.getByRole('button', { name: 'Pause synth', exact: true }).click();
    await hidePane(page, 'Mood');
    await sample('paused');
    for (const name of ['Memory A', 'Memory B', 'Memory C']) {
      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      await page.getByRole('button', { name: `Close ${name} workspace`, exact: true }).click();
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(2000);
    await sample('closed');
    // Observe delayed cleanup separately from the immediate close checkpoint.
    for (let settle = 1; settle <= 4; settle++) {
      await page.waitForTimeout(15_000);
      await sample(`closed-${settle * 15}s`);
    }
    expect(errors).toEqual([]);
  } finally {
    await cdp.detach();
    await app.close();
  }
});
