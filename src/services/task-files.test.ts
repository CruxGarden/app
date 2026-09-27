import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initServices, getServices } from './index';
import { captureTaskManifest } from './task-files';

const fp = (c: string) => c.repeat(64);

/**
 * A capture reads the disk for what the folder's rules include and keeps the
 * index's own entries for what they ignore (a tool's `runtime/`). Before this,
 * a capture dropped the ignored files from the head: complete archives lost the
 * tool they claimed to hold, and the Workshop emptied after an export.
 */
describe('captureTaskManifest through the main-process manifest capture', () => {
  let calls: { folder: string; indexedPaths: string[] }[];
  beforeEach(async () => {
    await initServices();
    calls = [];
    (globalThis as Record<string, unknown>).window = {
      electronAPI: {
        project: {
          captureManifest: async (folder: string, indexedPaths: string[]) => {
            calls.push({ folder, indexedPaths });
            return {
              files: [
                { path: 'src/a.js', fingerprint: fp('b'), size: 3, mode: 0o644, utf8: true },
                {
                  path: 'garden/bridge.js',
                  fingerprint: fp('e'),
                  size: 4,
                  mode: 0o644,
                  utf8: true,
                },
                { path: 'img.png', fingerprint: fp('c'), size: 5, mode: 0o644, utf8: false },
                { path: 'latin1.md', fingerprint: fp('d'), size: 7, mode: 0o755, utf8: false },
              ],
              retained: ['runtime/index.html'],
            };
          },
        },
      },
    };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('keeps indexed ignored paths, maps disk files without bytes, drops deleted files', async () => {
    const { crux, artifact } = getServices();
    const created = await crux.create({
      title: 'Font',
      type: 'workspace',
      meta: { projectFolder: '/garden/font', settings: {} },
    });
    await artifact.registerMany([
      {
        resourceId: created.id,
        path: 'runtime/index.html',
        fingerprint: fp('a'),
        size: 11,
        mimeType: 'text/html',
        encoding: 'utf-8',
        meta: { path: 'runtime/index.html' },
      },
      {
        resourceId: created.id,
        path: 'src/a.js',
        fingerprint: fp('9'),
        size: 2,
        mimeType: 'text/javascript',
        encoding: 'utf-8',
        meta: { path: 'src/a.js' },
      },
      {
        resourceId: created.id,
        path: 'garden/bridge.js',
        fingerprint: fp('e'),
        size: 4,
        mimeType: 'application/javascript',
        encoding: 'binary',
        meta: { path: 'garden/bridge.js' },
      },
      {
        resourceId: created.id,
        path: 'src/deleted.js',
        fingerprint: fp('8'),
        size: 2,
        mimeType: 'text/javascript',
        encoding: 'utf-8',
        meta: { path: 'src/deleted.js' },
      },
    ]);
    const manifest = await captureTaskManifest(created.id);
    expect(calls).toEqual([
      {
        folder: '/garden/font',
        indexedPaths: expect.arrayContaining(['runtime/index.html', 'src/a.js', 'src/deleted.js']),
      },
    ]);
    expect(Object.keys(manifest).sort()).toEqual([
      'garden/bridge.js',
      'img.png',
      'latin1.md',
      'runtime/index.html',
      'src/a.js',
    ]);
    // The index's own entry, untouched.
    expect(manifest['runtime/index.html']).toMatchObject({
      fingerprint: fp('a'),
      mimeType: 'text/html',
      encoding: 'utf-8',
      size: 11,
    });
    // Disk wins for included paths; sizes travel so indexing reads no blob.
    expect(manifest['src/a.js']).toEqual({
      fingerprint: fp('b'),
      mimeType: 'application/javascript',
      encoding: 'utf-8',
      mode: 0o644,
      size: 3,
    });
    expect(manifest['img.png']).toMatchObject({ encoding: 'binary', mimeType: 'image/png' });
    // Unchanged bytes keep the type they were registered with: no head churn on export.
    expect(manifest['garden/bridge.js']).toEqual({
      fingerprint: fp('e'),
      mimeType: 'application/javascript',
      encoding: 'binary',
      mode: 0o644,
      size: 4,
    });
    // A text type that is not valid UTF-8 stays binary, byte for byte.
    expect(manifest['latin1.md']).toMatchObject({ encoding: 'binary', mode: 0o755, size: 7 });
  });
});
