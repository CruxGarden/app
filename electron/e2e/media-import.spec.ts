import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { transcodeMedia } from '../src/media-transcode';
import { nativeFixtureBinary } from './native-binary-fixture';

// Actual production source build: input probing, encoding and output limits must
// agree with FFmpeg, not with a mock that merely accepts the chosen arguments.
test('media imports isolate concurrent jobs, refuse partial outputs, and recover after failure', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'crux-import-test-'));
  const binary = nativeFixtureBinary('ffmpeg');
  try {
    const source = join(directory, 'source.wav');
    execFileSync(binary, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      source,
    ]);
    const inputData = new Uint8Array(readFileSync(source));
    const input = { requestId: 'first', inputData, inputName: 'Garden Loop.wav', isAudio: true };
    const progress: number[] = [];
    const first = transcodeMedia(binary, directory, input, (value) => progress.push(value));
    await expect(transcodeMedia(binary, directory, input)).rejects.toThrow('already running');
    const second = transcodeMedia(binary, directory, {
      ...input,
      requestId: 'second',
      inputName: 'Second.wav',
    });
    await expect(
      transcodeMedia(binary, directory, { ...input, requestId: 'third' }),
    ).rejects.toThrow('busy');
    const [one, two] = await Promise.all([first, second]);
    expect(one[0].name).toBe('Garden Loop.m4a');
    expect(two[0].name).toBe('Second.m4a');
    expect(one[0].mimeType).toBe('audio/mp4');
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((p) => p >= 0 && p <= 1)).toBe(true);
    const converted = join(directory, 'converted.m4a');
    writeFileSync(converted, one[0].data);
    const probe = JSON.parse(
      execFileSync(
        nativeFixtureBinary('ffprobe'),
        ['-v', 'error', '-show_streams', '-of', 'json', converted],
        { encoding: 'utf8' },
      ),
    );
    expect(probe.streams[0].codec_name).toBe('aac');
    expect(Number(probe.streams[0].duration)).toBeGreaterThan(2.9);

    await expect(
      transcodeMedia(binary, directory, input, undefined, { outputBytes: 2000, timeoutMs: 10_000 }),
    ).rejects.toThrow('output size limit');
    await expect(
      transcodeMedia(binary, directory, input, undefined, { outputBytes: 500_000, timeoutMs: 1 }),
    ).rejects.toThrow('time limit');
    const playlist = new TextEncoder().encode('ffconcat version 1.0\nfile source.wav\n');
    await expect(
      transcodeMedia(binary, directory, { ...input, inputData: playlist }),
    ).rejects.toThrow('Media conversion failed');
    await expect(
      transcodeMedia(binary, directory, { ...input, inputData: new Uint8Array() }),
    ).rejects.toThrow('nonempty');
    await expect(
      transcodeMedia(binary, directory, { ...input, isAudio: 'yes' as never }),
    ).rejects.toThrow('conversion type');
    await expect(transcodeMedia(binary, directory, input)).resolves.toHaveLength(1);
    expect(readdirSync(directory).sort()).toEqual(['converted.m4a', 'source.wav']);
    expect(new Uint8Array(readFileSync(source))).toEqual(inputData);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

import { launchApp } from './launch';

test('desktop imports report matching request IDs and refuse malformed input', async () => {
  const { app, page, dir } = await launchApp();
  try {
    const source = join(dir, 'movie.webm');
    execFileSync(nativeFixtureBinary('ffmpeg'), [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=64x64:r=10:d=1',
      '-c:v',
      'libvpx',
      source,
    ]);
    const result = await page.evaluate(
      async (bytes) => {
        const progress: Array<{ requestId: string; progress: number }> = [];
        const api = window.electronAPI!.ffmpeg;
        const unsubscribe = api.onProgress((event) => progress.push(event));
        try {
          const input = {
            requestId: 'video-import',
            inputData: new Uint8Array(bytes),
            inputName: 'movie.webm',
            isAudio: false,
          };
          let refusal = '';
          try {
            await api.transcode({ ...input, requestId: '' });
          } catch (error) {
            refusal = String(error);
          }
          const outputs = await api.transcode(input);
          return { refusal, progress, name: outputs[0].name, bytes: Array.from(outputs[0].data) };
        } finally {
          unsubscribe();
        }
      },
      Array.from(readFileSync(source)),
    );
    expect(result.refusal).toContain('request ID');
    expect(result.name).toBe('movie.mp4');
    expect(result.progress.length).toBeGreaterThan(0);
    expect(
      result.progress.every(
        (event) => event.requestId === 'video-import' && event.progress >= 0 && event.progress <= 1,
      ),
    ).toBe(true);
    const output = join(dir, 'imported.mp4');
    writeFileSync(output, new Uint8Array(result.bytes));
    const probe = JSON.parse(
      execFileSync(
        nativeFixtureBinary('ffprobe'),
        ['-v', 'error', '-show_streams', '-of', 'json', output],
        { encoding: 'utf8' },
      ),
    );
    expect(probe.streams[0]).toMatchObject({ codec_name: 'h264', width: 64, height: 64 });
    expect(Number(probe.streams[0].duration)).toBeGreaterThanOrEqual(1);
  } finally {
    await app.close();
  }
});

test('document replies stop on reload and dispose their navigation listener', async () => {
  const { app, page } = await launchApp();
  try {
    await app.evaluate(({ app, BrowserWindow }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { gardenIpc } = load('./dist/garden-ipc.js') as typeof import('../src/garden-ipc');
      const window = BrowserWindow.getAllWindows()[0];
      const sender = window.webContents;
      const count = sender.listenerCount('did-start-navigation');
      const reply = gardenIpc(() => window).replies({
        sender,
        senderFrame: sender.mainFrame,
      } as Electron.IpcMainInvokeEvent);
      Object.assign(globalThis, { importReply: { reply, count } });
    });
    const subscribe = () =>
      page.evaluate(() => {
        const received: unknown[] = [];
        window.electronAPI!.ffmpeg.onProgress((event) => received.push(event));
        Object.assign(window, { importReceived: received });
      });
    const send = (id: string) =>
      app.evaluate((_electron, requestId) => {
        (globalThis as any).importReply.reply.send('ffmpeg:progress', { requestId, progress: 0.5 });
      }, id);
    const received = () => page.evaluate(() => (window as any).importReceived);
    await subscribe();
    await send('before-reload');
    await expect.poll(received).toEqual([{ requestId: 'before-reload', progress: 0.5 }]);
    await page.reload();
    await subscribe();
    await send('after-reload');
    // Cross-process delivery is asynchronous. A real later IPC reply drains the
    // round trip before we inspect the newly loaded document's listener.
    await page.evaluate(() => window.electronAPI!.ffmpeg.available());
    expect(await received()).toEqual([]);
    const counts = await app.evaluate(({ BrowserWindow }) => {
      const { reply, count } = (globalThis as any).importReply;
      reply.dispose();
      delete (globalThis as any).importReply;
      return {
        before: count,
        after: BrowserWindow.getAllWindows()[0].webContents.listenerCount('did-start-navigation'),
      };
    });
    expect(counts.after).toBe(counts.before);
  } finally {
    await app.close();
  }
});
