import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initServices, getServices } from './index';
import { initIngestion, stopIngestion, flushIngestion } from './ingestion';
import { folderForCrux } from './project-folder';

type Batch = {
  folder: string;
  folderMissing?: boolean;
  events: { type: 'write' | 'delete' | 'mkdir' | 'rmdir'; relPath: string }[];
};

/** Fake bridge: in-memory fs + captured onChanged subscriber to push batches. */
function fakeBridge() {
  const files = new Map<string, Uint8Array>();
  let subscriber: ((batch: Batch) => void) | null = null;
  const writeLog: string[] = [];
  const api = {
    createFolder: async (slug: string) => `/garden/${slug}`,
    ensureFolder: async (folder: string) => folder,
    folderExists: async () => true,
    writeFile: async (folder: string, rel: string, data: Uint8Array) => {
      writeLog.push(rel);
      files.set(`${folder}::${rel}`, data);
    },
    readFile: async (folder: string, rel: string) => {
      const d = files.get(`${folder}::${rel}`);
      if (!d) throw new Error('ENOENT');
      return d;
    },
    deleteFile: async (folder: string, rel: string) => void files.delete(`${folder}::${rel}`),
    renameFile: async () => {},
    reveal: async () => {},
    watch: async () => {},
    unwatch: async () => {},
    onChanged: (cb: (batch: Batch) => void) => {
      subscriber = cb;
      return () => {
        subscriber = null;
      };
    },
  };
  return {
    api,
    files,
    writeLog,
    /** Simulate the OS: put bytes on "disk" WITHOUT the app knowing. */
    externalWrite(folder: string, rel: string, content: string) {
      files.set(`${folder}::${rel}`, new TextEncoder().encode(content));
    },
    externalDelete(folder: string, rel: string) {
      files.delete(`${folder}::${rel}`);
    },
    emit(batch: Batch) {
      subscriber?.(batch);
    },
  };
}

describe('Ingestion (external edits → history)', () => {
  let bridge: ReturnType<typeof fakeBridge>;

  beforeEach(async () => {
    bridge = fakeBridge();
    (globalThis as Record<string, unknown>).window = {
      electronAPI: { project: bridge.api },
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    await initServices('local');
    initIngestion();
  });

  afterEach(() => {
    stopIngestion();
    delete (globalThis as Record<string, unknown>).window;
  });

  async function makeCrux(title: string) {
    const { crux } = getServices();
    const created = await crux.create({ title, type: 'workspace' });
    const folder = await folderForCrux(created.id);
    expect(folder).toBeTruthy();
    return { crux: created, folder: folder! };
  }

  async function artifactsOf(cruxId: string) {
    const { artifact } = getServices();
    return artifact.findByResource('crux', cruxId);
  }

  it('records a new external file as an artifact', async () => {
    const { crux, folder } = await makeCrux('Site');
    bridge.externalWrite(folder, 'notes.md', '# hello');
    bridge.emit({ folder, events: [{ type: 'write', relPath: 'notes.md' }] });
    await flushIngestion();

    const arts = await artifactsOf(crux.id);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.meta?.path).toBe('notes.md');
    const { artifact } = getServices();
    expect(await artifact.readContent(arts[0]!.id)).toBe('# hello');
  });

  it('updates the existing artifact when an external edit changes content', async () => {
    const { crux, folder } = await makeCrux('Site');
    const { artifact } = getServices();
    const original = await artifact.create({
      resourceId: crux.id,
      content: 'v1',
      meta: { path: 'index.html' },
    });

    bridge.externalWrite(folder, 'index.html', 'v2');
    bridge.emit({ folder, events: [{ type: 'write', relPath: 'index.html' }] });
    await flushIngestion();

    const arts = await artifactsOf(crux.id);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.id).toBe(original.id); // updated in place, not duplicated
    expect(await artifact.readContent(original.id)).toBe('v2');
  });

  it('skips echoes — identical content is not a change', async () => {
    const { crux, folder } = await makeCrux('Site');
    const { artifact } = getServices();
    const created = await artifact.create({
      resourceId: crux.id,
      content: 'same',
      meta: { path: 'a.txt' },
    });
    const before = (await artifact.findById(created.id)).updated;

    bridge.emit({ folder, events: [{ type: 'write', relPath: 'a.txt' }] });
    await flushIngestion();

    expect((await artifact.findById(created.id)).updated).toBe(before);
  });

  it('records an external delete', async () => {
    const { crux, folder } = await makeCrux('Site');
    const { artifact } = getServices();
    await artifact.create({ resourceId: crux.id, content: 'x', meta: { path: 'gone.txt' } });

    bridge.externalDelete(folder, 'gone.txt');
    bridge.emit({ folder, events: [{ type: 'delete', relPath: 'gone.txt' }] });
    await flushIngestion();

    expect(await artifactsOf(crux.id)).toHaveLength(0);
  });

  it('a missing Project Folder never cascades into artifact deletion', async () => {
    const { crux, folder } = await makeCrux('Site');
    const { artifact } = getServices();
    await artifact.create({ resourceId: crux.id, content: 'keep', meta: { path: 'k.txt' } });

    bridge.emit({ folder, folderMissing: true, events: [] });
    await flushIngestion();

    expect(await artifactsOf(crux.id)).toHaveLength(1);
  });

  it('ingests binary files via upload', async () => {
    const { crux, folder } = await makeCrux('Site');
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
    bridge.files.set(`${folder}::img/logo.png`, png);
    bridge.emit({ folder, events: [{ type: 'write', relPath: 'img/logo.png' }] });
    await flushIngestion();

    const arts = await artifactsOf(crux.id);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.encoding).toBe('binary');
    expect(arts[0]!.mimeType).toBe('image/png');
  });

  it('an external empty folder becomes a .keep artifact (visible in the tree)', async () => {
    const { crux, folder } = await makeCrux('Site');
    bridge.emit({ folder, events: [{ type: 'mkdir', relPath: 'assets' }] });
    await flushIngestion();

    const arts = await artifactsOf(crux.id);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.meta?.path).toBe('assets/.keep');
    // Write-through puts .keep on disk too — matches in-app folder creation
    expect(bridge.files.has(`${folder}::assets/.keep`)).toBe(true);
  });

  it('directories created alongside files get no .keep noise', async () => {
    const { crux, folder } = await makeCrux('Site');
    bridge.externalWrite(folder, 'src/app.js', 'code');
    bridge.emit({
      folder,
      events: [
        { type: 'mkdir', relPath: 'src' },
        { type: 'write', relPath: 'src/app.js' },
      ],
    });
    await flushIngestion();

    const paths = (await artifactsOf(crux.id)).map((a) => a.meta?.path);
    expect(paths).toEqual(['src/app.js']);
  });

  it('removing an external empty folder retires its .keep artifact', async () => {
    const { crux, folder } = await makeCrux('Site');
    bridge.emit({ folder, events: [{ type: 'mkdir', relPath: 'temp' }] });
    await flushIngestion();
    expect(await artifactsOf(crux.id)).toHaveLength(1);

    bridge.emit({ folder, events: [{ type: 'rmdir', relPath: 'temp' }] });
    await flushIngestion();
    expect(await artifactsOf(crux.id)).toHaveLength(0);
  });

  it('NEVER writes back to disk when recording external edits (ADR 0001: background flow is disk → store only)', async () => {
    const { crux, folder } = await makeCrux('Site');
    const { artifact } = getServices();
    await artifact.create({ resourceId: crux.id, content: 'v1', meta: { path: 'index.html' } });
    const writesBefore = bridge.writeLog.length;

    bridge.externalWrite(folder, 'index.html', 'v2-from-vscode');
    bridge.emit({ folder, events: [{ type: 'write', relPath: 'index.html' }] });
    await flushIngestion();

    // The store learned v2, but ingestion made zero disk writes — a newer
    // external save can never be clobbered by the recording path.
    const arts = await artifactsOf(crux.id);
    expect(await artifact.readContent(arts[0]!.id)).toBe('v2-from-vscode');
    expect(bridge.writeLog.length).toBe(writesBefore);
    expect(new TextDecoder().decode(bridge.files.get(`${folder}::index.html`))).toBe('v2-from-vscode');
  });

  it('recording an external delete does not touch the disk', async () => {
    const { crux, folder } = await makeCrux('Site');
    const { artifact } = getServices();
    await artifact.create({ resourceId: crux.id, content: 'x', meta: { path: 'gone.txt' } });

    // Simulate: user deletes on disk, then (race) re-creates before we process
    bridge.externalDelete(folder, 'gone.txt');
    bridge.externalWrite(folder, 'gone.txt', 'recreated');
    bridge.emit({ folder, events: [{ type: 'delete', relPath: 'gone.txt' }] });
    await flushIngestion();

    expect(await artifactsOf(crux.id)).toHaveLength(0);
    // The recreated file survives — delete recording never reached the disk
    expect(bridge.files.has(`${folder}::gone.txt`)).toBe(true);
  });

  it('replayed batches are idempotent (delete twice, write twice)', async () => {
    const { crux, folder } = await makeCrux('Site');
    bridge.externalWrite(folder, 'a.txt', 'hello');
    const batch: Batch = { folder, events: [{ type: 'write', relPath: 'a.txt' }] };
    bridge.emit(batch);
    bridge.emit(batch);
    await flushIngestion();
    expect(await artifactsOf(crux.id)).toHaveLength(1);

    bridge.externalDelete(folder, 'a.txt');
    const del: Batch = { folder, events: [{ type: 'delete', relPath: 'a.txt' }] };
    bridge.emit(del);
    bridge.emit(del);
    await flushIngestion();
    expect(await artifactsOf(crux.id)).toHaveLength(0);
  });

  it('events for unregistered folders are ignored', async () => {
    const { crux } = await makeCrux('Site');
    bridge.emit({
      folder: '/somewhere/else',
      events: [{ type: 'write', relPath: 'x.txt' }],
    });
    await flushIngestion();
    expect(await artifactsOf(crux.id)).toHaveLength(0);
  });
});
