import { test, expect } from '@playwright/test';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const capture = require('../dist/capture');
const { recordPreviewUrl, MAX_RECORD_BYTES } = require('../dist/record');

test('recording refuses invalid sizes before touching files; output refusal releases admission', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crux-record-limits-'));
  const frames = join(dir, 'frames');
  mkdirSync(frames);
  writeFileSync(join(frames, 'f0000.png'), 'keep');
  const options = { dir: frames, width: 1280, height: 720, fps: 30, maxSeconds: 1 };
  const original = capture.withCaptureWindow;
  try {
    for (const key of ['width', 'height', 'fps', 'maxSeconds']) {
      for (const value of [NaN, Infinity, -1, 0, 0.5, 999999]) {
        await expect(
          recordPreviewUrl('http://127.0.0.1', { ...options, [key]: value }),
        ).rejects.toThrow('must be an integer');
        expect(readFileSync(join(frames, 'f0000.png'), 'utf8')).toBe('keep');
      }
    }
    let oversized = true;
    capture.withCaptureWindow = async (
      _url: string,
      _size: unknown,
      fn: (win: unknown) => Promise<unknown>,
    ) =>
      fn({
        isDestroyed: () => false,
        webContents: {
          capturePage: async () => ({
            resize: () => ({
              toPNG: () => (oversized ? { length: MAX_RECORD_BYTES + 1 } : Buffer.from('png')),
            }),
          }),
          executeJavaScript: async () => '{"done":"1"}',
        },
      });
    await expect(recordPreviewUrl('http://127.0.0.1', options)).rejects.toThrow('256 MiB');
    expect(existsSync(join(frames, 'f0000.png'))).toBe(false);
    oversized = false;
    expect(await recordPreviewUrl('http://127.0.0.1', { ...options, fps: 1 })).toMatchObject({
      frames: 1,
    });
    expect(readFileSync(join(frames, 'f0000.png'), 'utf8')).toBe('png');
  } finally {
    capture.withCaptureWindow = original;
    rmSync(dir, { recursive: true, force: true });
  }
});
