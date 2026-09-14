import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
function stereo() {
  const rate = 48000,
    frames = rate,
    bytes = Buffer.alloc(44 + frames * 4);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    bytes.writeInt16LE(
      Math.round(Math.sin((i * 440 * 2 * Math.PI) / rate) * 10000 * (1 - i / frames)),
      44 + i * 4,
    );
    bytes.writeInt16LE(Math.round(Math.sin((i * 660 * 2 * Math.PI) / rate) * 6000), 46 + i * 4);
  }
  return bytes;
}
test('native multitrack tools arrange and mix clips while preserving manual changes through history and portable import', async () => {
  test.setTimeout(480000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir,
    archive = join(dir, 'arrangement.crux');
  const evidence = resolve(__dirname, '../../docs/audiomass-arrangement');
  mkdirSync(evidence, { recursive: true });
  let folder = '',
    id = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).project;
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText(
      /Saved to Garden|Audio saved to Cruxspace/,
      { timeout: 90000 },
    );
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const run = async (action: string, waveform = false) => {
    const page = instance.page,
      toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    const done = 'Audio ' + (waveform ? 'depth ' : 'arrangement ') + action + ' complete.';
    const count = async () =>
      (await storedCrux(page, id)).messages.filter(
        (m: any) => m.role === 'assistant' && m.content === done,
      ).length;
    const previous = await count();
    const box = page.getByPlaceholder('Send a message...');
    await box.fill('Use AudioMass [audiomass:' + (waveform ? 'depth-' : 'arrange-') + action + ']');
    await box.press('Enter');
    console.log('Arrangement:', action);
    await expect.poll(count, { timeout: 75000 }).toBe(previous + 1);
    await save();
    expect(
      (await storedCrux(page, id)).messages
        .flatMap((m: any) => m.toolCalls ?? [])
        .filter((c: any) => c.result?.startsWith('Error')),
    ).toEqual([]);
  };
  try {
    let page = instance.page;
    page.setDefaultTimeout(45000);
    page.on('pageerror', (e) => console.log('Audio arrangement:', e.message));
    await page.setViewportSize({ width: 2200, height: 1250 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^AudioMass/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await ready();
    id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    if (await frame().locator('.pk_modal').count())
      await frame().locator('.pk_modal').getByText('OK', { exact: true }).click();
    const reloaded = page.waitForEvent('framenavigated', {
      predicate: (f) => f.url().includes('/src/index.html'),
    });
    writeFileSync(join(folder, 'fixture.wav'), stereo());
    await reloaded;
    await ready();
    await run('load', true);
    const source = doc().waveform;
    await frame().locator('.pk_mt_topbtn').click();
    await save();
    // A person names an existing native track; subsequent agent changes must retain it.
    const manual = frame().locator('.pk_mt_tracks input[type=text]').first();
    await manual.fill('Manual ambience');
    await manual.press('Enter');
    await save();
    const manualTrack = doc().multitrack.tracks[0];
    await run('track');
    await run('place');
    await run('duplicate');
    const beforeEdit = doc().multitrack;
    await run('revise');
    const afterEdit = doc().multitrack;
    expect(afterEdit.tracks.find((t: any) => t.id === manualTrack.id)).toEqual(manualTrack);
    expect(afterEdit.clips[0]).toEqual(beforeEdit.clips[0]);
    expect(afterEdit.clips[1]).toMatchObject({
      name: 'Echo',
      start: 1.5,
      in: 0.1,
      out: 0.9,
      fi: 0.1,
      fo: 0.2,
    });
    await run('undo');
    expect(doc().multitrack).toEqual(beforeEdit);
    await run('redo');
    expect(doc().multitrack).toEqual(afterEdit);
    await run('split');
    expect(doc().multitrack.clips).toHaveLength(3);
    expect(doc().multitrack.clips[1].out).toBeCloseTo(0.5, 6);
    expect(doc().multitrack.clips[2]).toMatchObject({ start: 1.9, out: 0.9, fi: 0, fo: 0.2 });
    await run('mix');
    const effects = doc().multitrack.tracks.find((t: any) => t.name === 'Effects');
    expect(effects).toMatchObject({ vol: 0.6, pan: -0.25, mute: false, solo: true });
    await run('move');
    expect(doc().multitrack.tracks[0].id).toBe(effects.id);
    await run('remove');
    expect(doc().multitrack.clips).toHaveLength(2);
    await run('undo');
    expect(doc().multitrack.clips).toHaveLength(3);
    await run('delete-track');
    expect(doc().multitrack.tracks.some((t: any) => t.id === manualTrack.id)).toBe(false);
    await run('undo');
    expect(doc().multitrack.tracks.find((t: any) => t.id === manualTrack.id)).toEqual(manualTrack);
    expect(doc().waveform).toEqual(source);
    for (const c of doc().multitrack.clips) expect(c.buffer).toEqual(source);
    await run('master');
    expect(doc().multitrack.master_vol).toBe(0.8);
    // A native manual mute must affect the actual exported mix, not just metadata.
    const mute = frame().locator('.pk_mt_track[data-track="' + effects.id + '"] .pk_mt_mute');
    await mute.click();
    await save();
    expect(doc().multitrack.tracks[0].mute).toBe(true);
    await frame().getByLabel('Output name').fill('Muted reference');
    await frame().getByLabel('Output target').selectOption('mixdown');
    await frame().getByRole('button', { name: 'Save audio to Cruxspace', exact: true }).click();
    await expect.poll(() => outputs(folder).some((o) => o.label === 'Muted reference')).toBe(true);
    const silent = outputs(folder).find((o) => o.label === 'Muted reference')!;
    expect(
      readFileSync(join(folder, silent.path))
        .subarray(44)
        .every((b) => b === 0),
    ).toBe(true);
    await ready();
    await mute.click();
    await save();
    await run('export');
    const out = outputs(folder).find((o) => o.label === 'Arranged chimes')!;
    const bytes = readFileSync(join(folder, out.path));
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(bytes.readUInt16LE(22)).toBe(2);
    const rate = bytes.readUInt32LE(24);
    expect(bytes.readUInt32LE(40) / (rate * 4)).toBeCloseTo(2.3, 3);
    // The half-second gap between the source and trimmed echo stays silent.
    for (let i = Math.ceil(rate * 1.05); i < Math.floor(rate * 1.45); i++) {
      expect(bytes.readInt16LE(44 + i * 4)).toBe(0);
      expect(bytes.readInt16LE(46 + i * 4)).toBe(0);
    }
    expect(
      Array.from({ length: 2000 }, (_, i) => Math.abs(bytes.readInt16LE(44 + i * 4))).some(
        (x) => x > 1000,
      ),
    ).toBe(true);
    copyFileSync(join(folder, out.path), join(evidence, 'arranged-chimes.wav'));
    const final = doc();
    await page.screenshot({ path: join(evidence, 'native-arrangement.png') });
    await instance.app.close();
    instance = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    expect(doc()).toEqual(final);
    expect(
      await frame()
        .locator('body')
        .evaluate(
          () =>
            new Set(
              (window as any).PKAudioEditor.multitrack.getState().clips.map((c: any) => c.buffer),
            ).size,
        ),
    ).toBe(1);
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp();
    page = instance.page;
    await page.setViewportSize({ width: 2200, height: 1250 });
    await enterGarden(page);
    await importNativeCrux(page, archive);
    await ready();
    id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    expect(doc()).toEqual(final);
    expect(
      await frame()
        .locator('body')
        .evaluate(
          () =>
            new Set(
              (window as any).PKAudioEditor.multitrack.getState().clips.map((c: any) => c.buffer),
            ).size,
        ),
    ).toBe(1);
    const imported = outputs(folder).find((o) => o.label === 'Arranged chimes')!;
    expect(readFileSync(join(folder, imported.path))).toEqual(bytes);
    if (await frame().locator('.pk_modal').count())
      await frame().locator('.pk_modal').getByText('OK', { exact: true }).click();
    const name = frame().locator('.pk_mt_tracks input[type=text]').first();
    await name.fill('After import');
    await name.press('Enter');
    await save();
    expect(doc().multitrack.tracks[0].name).toBe('After import');
    await frame().getByText('Edit', { exact: true }).first().click();
    await frame().getByText(/^Undo/).first().click();
    await save();
    expect(doc().multitrack.tracks[0].name).toBe('Effects');
    await page.screenshot({ path: join(evidence, 'portable-arrangement.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
