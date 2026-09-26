import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from '../launch';
import { enterGarden, createCrux, switchCrux } from '../multi-crux-helpers';
import { togglePanel } from '../panel-helpers';
import type { SynthPatch } from '../../../src/audio/synth-patch';

test.skip(process.env.CRUX_SYNTH_SOAK !== '1', 'set CRUX_SYNTH_SOAK=1 for the five-minute soak');

const audio = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __cruxAudio: { state(): { playing: boolean; level: number; synth: SynthPatch } };
      }
    ).__cruxAudio.state(),
  );

test('live sound, hidden panels and drafts survive repeated multi-Crux work', async ({}, testInfo) => {
  test.setTimeout(450_000);
  const first = await launchApp({ sound: true, args: ['--mute-audio'] });
  const { app, page, dir } = first;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let client: Client | undefined;
  let expected: SynthPatch | undefined;
  const names = ['Sound desk', 'Writing desk', 'Reference desk'];
  const samples: unknown[] = [];
  try {
    await enterGarden(page);
    await page.evaluate(() => {
      const original = CSSStyleDeclaration.prototype.setProperty;
      CSSStyleDeclaration.prototype.setProperty = function(name, value, priority) {
        if (this === document.documentElement.style && name === '--signal-audio') return;
        return original.call(this, name, value, priority);
      };
    });
    for (const name of names) {
      await createCrux(page, name);
      await page.getByPlaceholder('Send a message...').fill(`Unsent idea for ${name}`);
    }
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    const path = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(path)).toBe(true);
    const config = JSON.parse(readFileSync(path, 'utf8'));
    client = new Client({ name: 'synth-soak', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args });
      const text = (result.content as { text?: string }[]).map((x) => x.text ?? '').join('\n');
      expect(result.isError, text).not.toBe(true);
      return JSON.parse(text);
    };
    const layout = {
      direction: 'row',
      first: 'collaboration',
      second: 'synth',
      splitPercentage: 50,
    };
    await call('workspace_layouts', { action: 'save', name: 'Sound and words', layout });
    await page.keyboard.press('Escape');
    await call('workspace_layouts', { action: 'apply', name: 'Sound and words' });
    await page
      .getByTestId('pane-body-synth')
      .getByRole('button', { name: 'Play synth', exact: true })
      .click();
    await expect.poll(async () => (await audio(page)).level).toBeGreaterThan(0.005);
    const cdp = await page.context().newCDPSession(page);
    const start = Date.now();
    for (let cycle = 0; cycle < 6; cycle++) {
      const actionStart = Date.now();
      const name = names[cycle % names.length]!;
      await switchCrux(page, name);
      await call('workspace_layouts', { action: 'apply', name: 'Sound and words' });
      await expect(page.getByPlaceholder('Send a message...')).toHaveValue(
        `Unsent idea for ${name}`,
      );
      const synth = page.getByTestId('pane-body-synth');
      // Alternate native UI edits with exactly the same public agent controls.
      const preset = ['glow', 'meadow', 'dusk', 'prism'][cycle % 4]!;
      if (cycle % 2 === 0) {
        await synth
          .getByRole('combobox', { name: 'Synth preset', exact: true })
          .selectOption(preset);
      } else {
        await call('set_synth', { preset });
      }
      const tempo = 40 + cycle * 2;
      await synth.getByRole('slider', { name: 'Synth tempo' }).fill(String(tempo));
      await expect.poll(async () => (await audio(page)).synth.tempo).toBe(tempo);
      expected = (await audio(page)).synth;
      await page.getByRole('button', { name: 'Close Crux Synth', exact: true }).click();
      expect((await audio(page)).playing).toBe(true);
      await expect.poll(async () => (await audio(page)).level).toBeGreaterThan(0.005);
      await togglePanel(page, 'Toggle crux synth');
      await expect(synth.getByRole('slider', { name: 'Synth tempo' })).toHaveValue(String(tempo));
      const actionMs = Date.now() - actionStart;
      // Deliberate listening dwell: let each patch sound and release voices across phrases.
      await page.waitForTimeout(Math.max(0, 15_000 - actionMs));
      expect((await audio(page)).playing).toBe(true);
      await expect.poll(async () => (await audio(page)).level).toBeGreaterThan(0.005);
      const heap = await cdp.send('Runtime.getHeapUsage');
      const processes = await app.evaluate(({ app }) =>
        app.getAppMetrics().map((p) => ({
          type: p.type,
          workingSetKB: p.memory.workingSetSize,
          cpu: p.cpu.percentCPUUsage,
        })),
      );
      samples.push({ cycle, elapsedMs: Date.now() - start, actionMs, heap, processes });
      expect(errors).toEqual([]);
    }
    for (const name of names) {
      await switchCrux(page, name);
      await expect(page.getByPlaceholder('Send a message...')).toHaveValue(
        `Unsent idea for ${name}`,
      );
    }
    await page.getByRole('button', { name: 'Pause soundscape', exact: true }).click();
    await expect.poll(async () => (await audio(page)).level).toBeLessThan(0.001);
    expect((await audio(page)).playing).toBe(false);
    await cdp.detach();
  } finally {
    const report = testInfo.outputPath('synth-workspace-soak.json');
    writeFileSync(report, JSON.stringify({ samples, errors }, null, 2));
    await testInfo.attach('soak measurements', { path: report, contentType: 'application/json' });
    await client?.close();
    await app.close();
  }
  const second = await launchApp({ dir, sound: true, args: ['--mute-audio'] });
  try {
    await second.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect.poll(async () => (await audio(second.page)).synth).toEqual(expected);
    expect((await audio(second.page)).playing).toBe(false);
    await expect(second.page.getByTestId('pane-body-synth')).toBeVisible();
  } finally {
    await second.app.close();
  }
});
