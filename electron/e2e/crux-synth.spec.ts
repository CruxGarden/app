import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import type { SynthPatch } from '../../src/audio/synth-patch';

type State = { playing: boolean; level: number; synth: SynthPatch; volume: number };
const audio = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __cruxAudio: { state(): State } }).__cruxAudio.state(),
  );

test('Crux Synth makes real audio, shares controls with outside agents, and restores a saved Mood after restart', async () => {
  test.setTimeout(150000);
  const first = await launchApp({ sound: true });
  const { page, dir } = first;
  let client: Client | undefined;
  let expected: SynthPatch;
  try {
    await enterGarden(page);
    await createCrux(page, 'Sound garden');
    expect((await audio(page)).playing).toBe(false);
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    client = new Client({ name: 'synth-gardener', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const call = async (name: string, input: Record<string, unknown> = {}) => {
      const result = await client!.callTool({ name, arguments: input });
      const text = (result.content as { text?: string }[]).map((c) => c.text ?? '').join('\n');
      expect(result.isError, text).not.toBe(true);
      return JSON.parse(text);
    };
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByRole('button', { name: 'Sound', exact: true }).click();
    const synth = page.getByRole('region', { name: 'Crux Synth', exact: true });
    await expect(synth).toBeVisible();
    await expect(synth.getByRole('group')).toHaveCount(4);
    const pause = synth.getByRole('button', { name: 'Pause synth', exact: true });
    if (await pause.isVisible()) await pause.click();
    await synth.getByRole('button', { name: 'Play synth', exact: true }).click();
    await expect
      .poll(async () => (await audio(page)).level, { timeout: 10000 })
      .toBeGreaterThan(0.005);
    const result = await call('set_synth', { preset: 'meadow', volume: 0.4 });
    expected = result.patch;
    expected.tracks[0].tone = 0.8;
    expected.tracks[1].voice = 'pad';
    expected.tracks[3].muted = true;
    await call('set_synth', { patch: expected });
    await expect(synth.getByRole('slider', { name: 'Track 1 tone', exact: true })).toHaveValue(
      '0.8',
    );
    await expect(synth.getByRole('combobox', { name: 'Track 2 voice', exact: true })).toHaveValue(
      'pad',
    );
    await expect(synth.getByRole('button', { name: 'Mute track 4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await synth.getByRole('slider', { name: 'Track 3 level', exact: true }).fill('0.22');
    expected.tracks[2].level = 0.22;
    expect((await call('get_synth')).patch).toEqual(expected);
    // Bus mute must silence already-sounding notes, not only prevent new ones.
    for (let i = 1; i <= 3; i++)
      await synth.getByRole('button', { name: `Mute track ${i}`, exact: true }).click();
    await expect.poll(async () => (await audio(page)).level).toBeLessThan(0.001);
    await call('set_synth', { patch: expected });
    await expect
      .poll(async () => (await audio(page)).level, { timeout: 20000 })
      .toBeGreaterThan(0.005);
    await pause.click();
    await expect.poll(async () => (await audio(page)).playing).toBe(false);
    await page.screenshot({ path: 'e2e/.results/crux-synth-controls.png' });
    await page.getByRole('button', { name: 'Open Mood Builder' }).click();
    await page.getByRole('button', { name: 'Moods', exact: true }).click();
    await page.getByRole('button', { name: 'Save current as Mood' }).click();
    await page.getByRole('textbox', { name: 'Mood name' }).fill('Living sound');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('mood-mood-living-sound')).toBeVisible();
    await call('set_synth', { preset: 'dusk' });
    await page
      .getByTestId('mood-mood-living-sound')
      .getByRole('button', { name: 'Apply Living sound', exact: true })
      .click();
    await expect.poll(async () => (await audio(page)).synth).toEqual(expected);
    await client.close();
    client = undefined;
  } finally {
    await client?.close();
    await first.app.close();
  }
  const second = await launchApp({ dir, sound: true });
  try {
    await second.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect.poll(async () => (await audio(second.page)).synth).toEqual(expected!);
    expect((await audio(second.page)).playing).toBe(false);
    await second.page.getByRole('button', { name: 'Play soundscape', exact: true }).click();
    await expect.poll(async () => (await audio(second.page)).level).toBeGreaterThan(0.005);
    await second.page.getByRole('button', { name: 'Pause soundscape', exact: true }).click();
  } finally {
    await second.app.close();
  }
});
