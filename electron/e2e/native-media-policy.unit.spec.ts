import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planFfmpegRun, planFfprobeRun } from '../src/ffmpeg-command';
import { planMagickRun } from '../src/magick-command';
import { planTypstRun } from '../src/typst-command';
import { runNativeProcess } from '../src/native-process';

test('native command languages reject overrides, executable options and indirect file syntax', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-native-policy-'));
  writeFileSync(join(folder, 'inside.png'), 'image');
  try {
    for (const option of [
      '-f',
      '-report',
      '-progress',
      '-filter_script',
      '-filter_complex',
      '-passlogfile',
      '-attach',
      '-protocol_whitelist',
      '-format_whitelist',
      '-codec_whitelist',
      '-enable_drefs',
      '-use_absolute_path',
    ])
      expect(
        () => planFfmpegRun(folder, ['-i', 'inside.png', option, 'file', 'out.mp4']),
        option,
      ).toThrow();
    for (const value of [
      'movie=secret.png',
      'scale=/w=secret.txt:h=2',
      'drawtext=textfile=secret.txt',
      'scale=iw:ih',
      'scale=2:2;amovie=secret.wav',
    ])
      expect(
        () => planFfmpegRun(folder, ['-i', 'inside.png', '-vf', value, 'out.mp4']),
        value,
      ).toThrow();
    for (const value of ['out.m3u8', 'out.mpd', 'out.ffconcat', '../out.mp4', 'file:out.mp4'])
      expect(() => planFfmpegRun(folder, ['-i', 'inside.png', value]), value).toThrow();
    for (const option of ['-write', '-process', '-profile', '-set', '-limit', '-format'])
      expect(
        () => planMagickRun(folder, ['inside.png', option, 'anything', 'out.png']),
        option,
      ).toThrow();
    for (const source of ['@inside.png', 'inside.png[0]', 'PNG:inside.png', '*.png', 'inside.svg'])
      expect(() => planMagickRun(folder, [source, 'out.png']), source).toThrow();
    for (const option of [
      '--root=/',
      '--root',
      '--open',
      '--font-path',
      '--package-path',
      '--deps',
      '--timings',
    ])
      expect(
        () => planTypstRun(folder, ['compile', option, 'inside.typ', 'out.pdf']),
        option,
      ).toThrow();
    expect(() => planFfprobeRun(folder, ['-show_entries', 'format', 'inside.png'])).toThrow();
    for (const invalid of [[], ['-i', 3], Array(129).fill('x'), ['x'.repeat(8193)], ['\0']])
      expect(() => planFfmpegRun(folder, invalid)).toThrow();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('frame expansion checks concrete files including dangling output links and private render inputs', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-frame-policy-'));
  try {
    mkdirSync(join(folder, '.crux/render/clip'), { recursive: true });
    writeFileSync(join(folder, '.crux/render/clip/f0001.png'), 'frame');
    expect(
      planFfmpegRun(folder, ['-framerate', '30', '-i', '.crux/render/clip/f%04d.png', 'out.mp4'])
        .outputs,
    ).toEqual([join(folder, 'out.mp4')]);
    mkdirSync(join(folder, 'frames'));
    symlinkSync(join(folder, 'missing.png'), join(folder, 'frames/f0001.png'));
    expect(() =>
      planFfmpegRun(folder, ['-i', '.crux/render/clip/f%04d.png', 'frames/f%04d.png']),
    ).toThrow();
    expect(() =>
      planFfmpegRun(folder, ['-pattern_type', 'glob', '-i', 'frames/*.png', 'out.mp4']),
    ).toThrow();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('native processes bound runtime and output and report compiler refusals', async () => {
  for (const timeoutMs of [0, -1, Infinity, NaN, 1_800_001])
    expect(() =>
      runNativeProcess(process.execPath, ['-v'], { cwd: tmpdir(), timeoutMs }),
    ).toThrow();
  const result = await runNativeProcess(
    process.execPath,
    ['-e', 'console.error("declined");process.exit(2)'],
    { cwd: tmpdir() },
  );
  expect(result.code).toBe(2);
  expect(result.stderrTail).toContain('declined');
  const timed = await runNativeProcess(
    process.execPath,
    ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],
    {
      cwd: tmpdir(),
      timeoutMs: 300,
    },
  );
  expect(timed.code).not.toBe(0);
  expect(timed.ms).toBeLessThan(5000);
  await expect(
    runNativeProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(3*1024*1024))'], {
      cwd: tmpdir(),
    }),
  ).rejects.toThrow();
});
