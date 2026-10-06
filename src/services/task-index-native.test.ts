import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from './index';
import { indexTaskManifest } from './task-files';
import { getSqliteClient } from './sqlite/client';
import { hashContent } from './sqlite/helpers';
import { folderForCrux } from './project-folder';
import { initIngestion, stopIngestion, flushIngestion } from './ingestion';
import type { ChangeBatch } from '@/lib/platform';

localApiFixture();
let bridge: ReturnType<typeof watcher>;
function watcher() {
  const files = new Map<string, Uint8Array>();
  let subscriber: ((batch: ChangeBatch) => void) | undefined;
  const writeLog: string[] = [];
  return {
    api: {
      folderExists: async () => true,
      ensureFolder: async (folder: string) => folder,
      watch: async () => {},
      unwatch: async () => {},
      readFile: async (folder: string, path: string) => {
        const bytes = files.get(`${folder}:${path}`);
        if (!bytes) throw new Error('ENOENT');
        return bytes;
      },
      writeFile: async (_folder: string, path: string) => {
        writeLog.push(path);
      },
      onChanged: (cb: (batch: ChangeBatch) => void) => {
        subscriber = cb;
        return () => {
          subscriber = undefined;
        };
      },
    },
    writeLog,
    externalWrite(folder: string, path: string, content: string) {
      files.set(`${folder}:${path}`, new TextEncoder().encode(content));
    },
    emit(batch: ChangeBatch) {
      subscriber?.(batch);
    },
  };
}
beforeEach(async () => {
  bridge = watcher();
  vi.stubGlobal('window', {
    electronAPI: { project: bridge.api },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  await initServices();
  initIngestion();
});
afterEach(() => {
  stopIngestion();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('serializes Task indexing with a watcher echo arriving during a slow native manifest admission', async () => {
  const crux = await getServices().crux.create({ title: 'Built candidate', type: 'workspace' });
  const folder = (await folderForCrux(crux.id))!;
  const content = 'generated lockfile';
  const bytes = new TextEncoder().encode(content);
  const fingerprint = await hashContent(bytes);
  const db = getSqliteClient();
  await db.blobWrite(fingerprint, bytes);
  bridge.externalWrite(folder, 'generated.txt', content);
  const edit = db.fileContent!.edit.bind(db.fileContent);
  const spy = vi.spyOn(db.fileContent!, 'edit').mockImplementationOnce(async (input) => {
    bridge.emit({ folder, events: [{ type: 'write', relPath: 'generated.txt' }] });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return edit(input);
  });
  try {
    await indexTaskManifest(crux.id, {
      'generated.txt': { fingerprint, encoding: 'utf-8', mimeType: 'text/plain', mode: 0o644 },
    });
    await flushIngestion();
    const rows = await getServices().artifact.findByResource('crux', crux.id);
    expect(rows).toHaveLength(1);
    expect(await getServices().artifact.readContent(rows[0]!)).toBe(content);
    expect(rows[0]!.meta?.mode).toBe(0o644);
    expect(bridge.writeLog).toEqual([]);
    await expect(
      indexTaskManifest(crux.id, {
        'generated.txt': {
          fingerprint: 'a'.repeat(64),
          encoding: 'utf-8',
          mimeType: 'text/plain',
          mode: 0o644,
        },
      }),
    ).rejects.toThrow();
    bridge.externalWrite(folder, 'generated.txt', 'Later external edit');
    bridge.emit({ folder, events: [{ type: 'write', relPath: 'generated.txt' }] });
    await flushIngestion();
    expect(
      await getServices().artifact.readContent(
        (await getServices().artifact.findByResource('crux', crux.id))[0]!,
      ),
    ).toBe('Later external edit');
  } finally {
    spy.mockRestore();
    await flushIngestion();
  }
});
