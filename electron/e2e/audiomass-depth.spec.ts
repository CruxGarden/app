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
test('audio waveform tools preserve manual work, native history and portable PCM with native encoded outputs', async () => {
  test.setTimeout(480000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir,
    archive = join(dir, 'audio.crux');
  const evidence = resolve(__dirname, '../../docs/audiomass-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '',
    id = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).project;
  const pcm = () =>
    doc().waveform.__cruxAudio.channels.map((c: any) =>
      readFileSync(join(folder, 'data', c.__cruxBinary.path)),
    ) as Buffer[];
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText(
      /Saved to Garden|Audio saved to Cruxspace/,
      { timeout: 90000 },
    );
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const run = async (action: string) => {
    const page = instance.page,
      toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    const previous = (await storedCrux(page, id)).messages.filter(
      (m: any) => m.role === 'assistant' && m.content === 'Audio depth ' + action + ' complete.',
    ).length;
    const box = page.getByPlaceholder('Send a message...');
    await box.fill('Use AudioMass [audiomass:depth-' + action + ']');
    await box.press('Enter');
    console.log('Audio action', action);
    await expect
      .poll(
        async () =>
          (await storedCrux(page, id)).messages.filter(
            (m: any) =>
              m.role === 'assistant' && m.content === 'Audio depth ' + action + ' complete.',
          ),
        { timeout: 60000 },
      )
      .toHaveLength(previous + 1);
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
    page.on('pageerror', (e) => console.log('Audio depth:', e.message));
    await page.setViewportSize({ width: 2200, height: 1250 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^AudioMass/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await ready();
    id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Audio depth folder', folder);
    if (await frame().locator('.pk_modal').count())
      await frame().locator('.pk_modal').getByText('OK', { exact: true }).click();
    // Adding a root Artifact refreshes this static preview. Finish fixture ingestion/reload before starting the agent turn.
    const reloaded = page.waitForEvent('framenavigated', {
      predicate: (f) => f.url().includes('/src/index.html'),
    });
    writeFileSync(join(folder, 'fixture.wav'), stereo());
    await reloaded;
    await ready();
    await run('load');
    expect(doc().waveform.__cruxAudio.length / doc().waveform.__cruxAudio.sampleRate).toBeCloseTo(
      1,
      3,
    );
    const imported = pcm();
    // A person uses the native effect menu before the agent makes a scoped channel edit.
    await frame().getByText('Effects', { exact: true }).first().click();
    await frame().getByText('Reverse', { exact: true }).first().click();
    await expect.poll(() => pcm()[0].equals(imported[0])).toBe(false);
    await save();
    const manual = pcm();
    await run('mute');
    const edited = pcm();
    const rate = doc().waveform.__cruxAudio.sampleRate,
      start = rate * 0.25 * 4,
      end = rate * 0.5 * 4;
    expect(edited[1]).toEqual(manual[1]);
    expect(edited[0].subarray(0, start)).toEqual(manual[0].subarray(0, start));
    expect(edited[0].subarray(end)).toEqual(manual[0].subarray(end));
    expect(
      Array.from({ length: (end - start) / 4 }, (_, i) =>
        edited[0].readFloatLE(start + i * 4),
      ).every((n) => n === 0),
    ).toBe(true);
    await run('undo');
    expect(pcm()).toEqual(manual);
    await run('redo');
    expect(pcm()).toEqual(edited);
    await run('copy');
    await run('paste');
    expect(doc().waveform.__cruxAudio.length / rate).toBeCloseTo(1.25, 3);
    const pasted = pcm();
    expect(pasted[1].subarray(rate * 0.75 * 4, rate * 4)).toEqual(manual[1].subarray(start, end));
    await run('silence');
    expect(doc().waveform.__cruxAudio.length / rate).toBeCloseTo(1.5, 3);
    expect(
      pcm()[1]
        .subarray(rate * 0.5 * 4, rate * 0.75 * 4)
        .every((n) => n === 0),
    ).toBe(true);
    await run('cut');
    expect(doc().waveform.__cruxAudio.length / rate).toBeCloseTo(1.25, 3);
    await run('delete');
    expect(doc().waveform.__cruxAudio.length / rate).toBeCloseTo(1, 3);
    // Fresh source gives each native effect meaningful nonzero audio, and preserves a manual native edit.
    await run('load');
    const beforeEffects = pcm();
    for (const effect of ['gain', 'normalize', 'fade-in', 'fade-out', 'reverse']) {
      await run(effect);
      const after = pcm();
      expect(after[1]).toEqual(beforeEffects[1]);
      expect(after[0].subarray(0, start)).toEqual(beforeEffects[0].subarray(0, start));
      expect(after[0].subarray(end)).toEqual(beforeEffects[0].subarray(end));
      expect(after[0].equals(beforeEffects[0])).toBe(false);
      await run('undo');
      expect(pcm()).toEqual(beforeEffects);
    }
    await run('exports');
    const output = (label: string) =>
      readFileSync(join(folder, outputs(folder).find((o) => o.label === label)!.path));
    const wav = output('Depth wav');
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt32LE(40)).toBe(rate * 0.25 * 4);
    for (let i = 0; i < 128; i++)
      for (let c = 0; c < 2; c++) {
        const sample = beforeEffects[c].readFloatLE(start + i * 4);
        expect(
          Math.abs(wav.readInt16LE(44 + i * 4 + c * 2) - sample * (sample < 0 ? 32768 : 32767)),
        ).toBeLessThanOrEqual(1);
      }

    const flac = output('Depth flac');
    expect(flac.subarray(0, 4).toString()).toBe('fLaC');
    expect(output('Depth mp3').length).toBeGreaterThan(2000);
    // Decode actual native exports in the browser and compare lossless samples with original PCM.
    const flacPath = outputs(folder).find((o) => o.label === 'Depth flac')!.path;
    const decoded = await frame()
      .locator('body')
      .evaluate(async (_el, path) => {
        const bytes = await (await fetch('../' + path)).arrayBuffer();
        const buffer = await (
          window as any
        ).PKAudioEditor.engine.wavesurfer.backend.ac.decodeAudioData(bytes);
        return {
          duration: buffer.duration,
          channels: buffer.numberOfChannels,
          samples: Array.from(buffer.getChannelData(1).slice(0, 128)),
        };
      }, flacPath);
    expect(decoded.channels).toBe(2);
    expect(decoded.duration).toBeCloseTo(1, 3);
    for (let i = 0; i < 128; i++)
      expect(
        Math.abs((decoded.samples[i] as number) - beforeEffects[1].readFloatLE(i * 4)),
      ).toBeLessThan(1 / 32768 + 0.00001);
    const mp3Path = outputs(folder).find((o) => o.label === 'Depth mp3')!.path;
    const decodedMp3 = await frame()
      .locator('body')
      .evaluate(async (_el, path) => {
        const bytes = await (await fetch('../' + path)).arrayBuffer();
        const audio = await (
          window as any
        ).PKAudioEditor.engine.wavesurfer.backend.ac.decodeAudioData(bytes);
        return {
          seconds: audio.duration,
          channels: audio.numberOfChannels,
          peak: Math.max(...audio.getChannelData(0).slice(0, 20000)),
        };
      }, mp3Path);
    expect(decodedMp3.channels).toBe(2);
    expect(Math.abs(decodedMp3.seconds - 1)).toBeLessThan(0.1);
    expect(decodedMp3.peak).toBeGreaterThan(0.1);
    for (const label of ['Depth wav', 'Depth mp3', 'Depth flac']) {
      const asset = outputs(folder).find((o) => o.label === label)!;
      copyFileSync(
        join(folder, asset.path),
        join(
          evidence,
          label === 'Depth wav'
            ? 'selection.wav'
            : label === 'Depth mp3'
              ? 'waveform.mp3'
              : 'waveform.flac',
        ),
      );
    }
    // Native arrangement import creates a clip; the tool exports the actual mixer rather than the editor buffer.
    await frame().locator('.pk_mt_topbtn').click();
    await frame().getByText('File', { exact: true }).first().click();
    const chooser = page.waitForEvent('filechooser');
    await frame().getByText('Load from Computer', { exact: true }).click();
    await (await chooser).setFiles(join(folder, 'fixture.wav'));
    await expect.poll(() => doc().multitrack.clips.length).toBe(1);
    await run('mixdown');
    expect(output('Depth mixdown').subarray(0, 4).toString()).toBe('RIFF');
    await frame().locator('.pk_mt_topbtn').click();
    await run('trim');
    expect(doc().waveform.__cruxAudio.length / rate).toBeCloseTo(0.25, 3);
    await save();
    const finalPCM = pcm(),
      finalArrangement = doc().multitrack;
    await page.screenshot({ path: join(evidence, 'native-audio.png') });
    await instance.app.close();
    instance = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    expect(pcm()).toEqual(finalPCM);
    expect(doc().multitrack).toEqual(finalArrangement);
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
    expect(pcm()).toEqual(finalPCM);
    expect(doc().multitrack).toEqual(finalArrangement);
    expect(output('Depth flac')).toEqual(flac);
    if (await frame().locator('.pk_modal').count())
      await frame().locator('.pk_modal').getByText('OK', { exact: true }).click();
    await frame().getByText('Effects', { exact: true }).first().click();
    await frame().getByText('Reverse', { exact: true }).first().click();
    await expect.poll(() => pcm()[0].equals(finalPCM[0])).toBe(false);
    await save();
    await page.screenshot({ path: join(evidence, 'portable-audio.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
