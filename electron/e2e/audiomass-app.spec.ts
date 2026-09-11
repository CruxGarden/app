import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

function tone() {
  const frames = 48000,
    bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(96000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    bytes.writeInt16LE(Math.round(Math.sin((i * 440 * Math.PI * 2) / 48000) * 12000), 44 + i * 2);
  return bytes;
}
test('AudioMass native waveform, multitrack, agent, conflict and restart', async () => {
  test.setTimeout(180000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/audiomass');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  let waveformLength = 0;
  let waveformSample = 0;
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const wav = join(first.dir, 'tone.wav');
  writeFileSync(wav, tone());
  try {
    const { page } = first;
    page.on('pageerror', (e) => console.log('AudioMass', e.message));
    await page.setViewportSize({ width: 1700, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^AudioMass/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('AudioMass folder', folder);
    await page.screenshot({ path: join(evidence, 'audiomass-initial.png') });
    const welcome = frame.locator('.pk_modal');
    if (await welcome.count())
      await frame.locator('.pk_modal').getByText('OK', { exact: true }).click();
    await frame.getByText('File', { exact: true }).first().click();
    const chooser = page.waitForEvent('filechooser');
    await frame.getByText('Load from Computer', { exact: true }).click();
    await (await chooser).setFiles(wav);
    await expect.poll(() => !!doc().project.waveform).toBe(true);
    waveformLength = doc().project.waveform.__cruxAudio.length;
    expect(waveformLength / doc().project.waveform.__cruxAudio.sampleRate).toBeCloseTo(1, 3);
    const originalPCM = doc().project.waveform.__cruxAudio.channels[0].__cruxBinary.path;
    // Native waveform effect menu, followed by its normal undo history.
    await frame.getByText('Effects', { exact: true }).first().click();
    await frame.getByText('Reverse', { exact: true }).first().click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await expect
      .poll(() => doc().project.waveform.__cruxAudio.channels[0].__cruxBinary.path)
      .not.toBe(originalPCM);
    await frame.locator('.pk_mt_topbtn').click();
    await frame.getByText('File', { exact: true }).first().click();
    const chooser2 = page.waitForEvent('filechooser');
    await frame.getByText('Load from Computer', { exact: true }).click();
    await (await chooser2).setFiles(wav);
    await expect.poll(() => doc().project.multitrack.clips.length).toBe(1);
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Rename the audio track [audiomass:track]');
    await chat.press('Enter');
    await expect
      .poll(() => doc().project.multitrack.tracks[0].name, { timeout: 45000 })
      .toBe('Garden recording');
    async function nativeExport(format: string) {
      const path = join(first.dir, 'export.' + format);
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__audioDownload = null;
        session.defaultSession.once('will-download', (_e, item) => {
          item.setSavePath(path);
          item.once('done', (_e, state) => {
            (globalThis as any).__audioDownload = state;
          });
        });
      }, path);
      await frame.getByText('File', { exact: true }).first().click();
      await frame.getByText('Export / Download', { exact: true }).first().click();
      await frame.locator('label[for=' + (format === 'amss' ? 'k04' : 'k02') + ']').click();
      await frame.locator('.pk_modal_a_accpt').click();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__audioDownload))
        .toBe('completed');
      return path;
    }
    const sessionPath = await nativeExport('amss');
    const wavPath = await nativeExport('wav');
    expect(readFileSync(wavPath).subarray(0, 4).toString()).toBe('RIFF');
    expect(readFileSync(wavPath).length).toBeGreaterThan(80000);
    await frame.locator('.pk_mt_tracks input[type=text]').first().fill('Before reimport');
    await frame.locator('.pk_mt_tracks input[type=text]').first().press('Enter');
    await expect.poll(() => doc().project.multitrack.tracks[0].name).toBe('Before reimport');
    await frame.getByText('File', { exact: true }).first().click();
    const importSession = page.waitForEvent('filechooser');
    await frame.getByText('Load from Computer', { exact: true }).click();
    await (await importSession).setFiles(sessionPath);
    await expect.poll(() => doc().project.multitrack.tracks[0].name).toBe('Garden recording');
    const before = doc();
    waveformSample = await frame
      .locator('body')
      .evaluate(
        () => (window as any).PKAudioEditor.engine.wavesurfer.backend.buffer.getChannelData(0)[100],
      );
    const external = structuredClone(before);
    external.project.multitrack.tracks[0].name = 'External recording';
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await frame.locator('body').evaluate(() => {
      const a = (window as any).PKAudioEditor;
      a.multitrack.gardenRenameTrack(a.multitrack.getState().tracks[0].id, 'Draft name');
    });
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(doc().project.multitrack.tracks[0].name).toBe('External recording');
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await page.screenshot({ path: join(evidence, 'audiomass-workshop.png') });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await second.page.setViewportSize({ width: 1700, height: 1100 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    const native = await frame.locator('body').evaluate(() => {
      const a = (window as any).PKAudioEditor;
      return {
        track: a.multitrack.getState().tracks[0].name,
        clips: a.multitrack.getState().clips.length,
        length: a.engine.wavesurfer.backend.buffer.length,
        sample: a.engine.wavesurfer.backend.buffer.getChannelData(0)[100],
      };
    });
    expect(native).toEqual({
      track: 'External recording',
      clips: 1,
      length: waveformLength,
      sample: waveformSample,
    });
    await second.page.screenshot({ path: join(evidence, 'audiomass-reopened.png') });
  } finally {
    await second.app.close();
  }
});
