/** Reproducible, silent OfflineAudioContext renders of the production instrument. */
import { build } from 'esbuild';
import { chromium } from '../electron/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve(process.argv[2] || '/private/tmp/crux-synth-listening');
await mkdir(out, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `export {renderSynth} from './src/audio/synth'; export {synthPreset} from './src/audio/synth-patch';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'CruxSynthRender',
  platform: 'browser',
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.addScriptTag({ content: bundle.outputFiles[0].text });
const results = [];
try {
  for (const id of ['glow', 'meadow', 'dusk', 'prism', 'stress', 'silent']) {
    const start = Date.now();
    const result = await page.evaluate(
      async ({ id }) => {
        const { renderSynth, synthPreset } = window.CruxSynthRender;
        const patch = synthPreset(id === 'stress' || id === 'silent' ? 'prism' : id);
        if (id === 'stress') {
          patch.space = 1;
          patch.tempo = 100;
          patch.tracks.forEach((t) => {
            t.level = 1;
            t.tone = 1;
            t.movement = 1;
            t.voice = 'pad';
          });
        }
        if (id === 'silent') patch.tracks.forEach((t) => (t.muted = true));
        const seconds = id === 'silent' ? 10 : 64;
        const buffer = await renderSynth(patch, seconds, 42);
        const left = buffer.getChannelData(0),
          right = buffer.getChannelData(1);
        let peak = 0,
          power = 0,
          side = 0,
          dc = 0,
          nonfinite = 0,
          step = 0;
        for (let i = 0; i < left.length; i++) {
          for (const sample of [left[i], right[i]]) {
            if (!Number.isFinite(sample)) nonfinite++;
            peak = Math.max(peak, Math.abs(sample));
            power += sample * sample;
            dc += sample;
          }
          side += (left[i] - right[i]) ** 2;
          if (i)
            step = Math.max(
              step,
              Math.abs(left[i] - left[i - 1]),
              Math.abs(right[i] - right[i - 1]),
            );
        }
        const windows = [];
        for (let start = 0; start < left.length; start += buffer.sampleRate * 4) {
          let sum = 0;
          const end = Math.min(left.length, start + buffer.sampleRate * 4);
          for (let i = start; i < end; i++) sum += (left[i] ** 2 + right[i] ** 2) / 2;
          windows.push(Math.sqrt(sum / (end - start)));
        }
        const stats = {
          id,
          seconds,
          patch,
          peak,
          rms: Math.sqrt(power / (left.length * 2)),
          stereoRms: Math.sqrt(side / left.length),
          dc: dc / (left.length * 2),
          nonfinite,
          maxSampleStep: step,
          windowRms: windows,
        };
        const bytes = new Uint8Array(44 + left.length * 4),
          view = new DataView(bytes.buffer);
        const tag = (offset, text) =>
          [...text].forEach((ch, i) => (bytes[offset + i] = ch.charCodeAt(0)));
        tag(0, 'RIFF');
        view.setUint32(4, bytes.length - 8, true);
        tag(8, 'WAVE');
        tag(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 2, true);
        view.setUint32(24, buffer.sampleRate, true);
        view.setUint32(28, buffer.sampleRate * 4, true);
        view.setUint16(32, 4, true);
        view.setUint16(34, 16, true);
        tag(36, 'data');
        view.setUint32(40, left.length * 4, true);
        for (let i = 0; i < left.length; i++) {
          view.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), true);
          view.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), true);
        }
        let binary = '';
        for (let i = 0; i < bytes.length; i += 32768)
          binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        return { stats, wav: btoa(binary) };
      },
      { id },
    );
    await writeFile(resolve(out, `${id}.wav`), Buffer.from(result.wav, 'base64'));
    results.push({ ...result.stats, renderMs: Date.now() - start });
    console.log(
      JSON.stringify({
        id,
        peak: result.stats.peak,
        rms: result.stats.rms,
        stereoRms: result.stats.stereoRms,
        nonfinite: result.stats.nonfinite,
        renderMs: Date.now() - start,
      }),
    );
    if (
      result.stats.nonfinite ||
      result.stats.peak >= 0.98 ||
      (id === 'silent' ? result.stats.peak !== 0 : result.stats.rms < 0.001)
    )
      throw new Error(`Audio bounds failed for ${id}`);
  }
  await writeFile(
    resolve(out, 'measurements.json'),
    JSON.stringify({ seed: 42, sampleRate: 44100, results }, null, 2),
  );
} finally {
  await browser.close();
}
