import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { hashContent } from './sqlite/helpers';
import { SqliteCruxService } from './sqlite/crux.service';
import { SqliteArtifactService } from './sqlite/artifact.service';
import {
  folderForCrux,
  artifactRelPath,
  projectAllArtifacts,
  projectFolderExists,
  rehomeProjectFolders,
} from './project-folder';

/**
 * Fake of the Electron project bridge — an in-memory "filesystem" keyed by
 * `${folder}::${relPath}` plus a folder set, mimicking main-process behavior.
 */
function fakeProjectBridge() {
  const files = new Map<string, Uint8Array>();
  const folders = new Set<string>();
  let counter = 0;
  const api = {
    createFolder: async (slug: string) => {
      let name = slug;
      while (folders.has(`/garden/${name}`)) name = `${slug}-${++counter + 1}`;
      const folder = `/garden/${name}`;
      folders.add(folder);
      return folder;
    },
    ensureFolder: async (folder: string) => {
      folders.add(folder);
      return folder;
    },
    folderExists: async (folder: string) => folders.has(folder),
    writeFile: async (folder: string, rel: string, data: Uint8Array) => {
      files.set(`${folder}::${rel}`, data);
    },
    readFile: async (folder: string, rel: string) => {
      const d = files.get(`${folder}::${rel}`);
      if (!d) throw new Error('not found');
      return d;
    },
    deleteFile: async (folder: string, rel: string) => {
      files.delete(`${folder}::${rel}`);
    },
    renameFile: async (folder: string, from: string, to: string) => {
      const d = files.get(`${folder}::${from}`);
      if (d) {
        files.delete(`${folder}::${from}`);
        files.set(`${folder}::${to}`, d);
      }
    },
    reveal: async () => {},
    listFiles: async (folder: string) =>
      [...files.keys()]
        .filter((k) => k.startsWith(`${folder}::`))
        .map((k) => k.slice(folder.length + 2))
        .sort(),
  };
  return { api, files, folders };
}

function text(bytes: Uint8Array | undefined): string | undefined {
  return bytes ? new TextDecoder().decode(bytes) : undefined;
}

describe('Project Folder write-through (ADR 0001)', () => {
  let bridge: ReturnType<typeof fakeProjectBridge>;
  const cruxService = new SqliteCruxService();
  const artifactService = new SqliteArtifactService();

  beforeEach(() => {
    bridge = fakeProjectBridge();
    (globalThis as Record<string, unknown>).window = {
      electronAPI: { project: bridge.api },
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('creating a workspace crux creates and registers a Project Folder', async () => {
    const crux = await cruxService.create({ title: 'My Blog', type: 'workspace' });
    expect(crux.meta?.projectFolder).toBe('/garden/my-blog');
    expect(bridge.folders.has('/garden/my-blog')).toBe(true);
    expect(await folderForCrux(crux.id)).toBe('/garden/my-blog');
  });

  it('restores into a fresh folder even when the exporting folder still exists', async () => {
    await initServices();
    const crux = await cruxService.create({ title: 'Restore me', type: 'workspace' });
    const old = crux.meta!.projectFolder as string;
    await artifactService.create({
      resourceId: crux.id,
      content: 'restored bytes',
      meta: { path: 'original.txt' },
    });
    // The incoming database and a still-existing pre-restore folder disagree.
    bridge.files.set(`${old}::original.txt`, new TextEncoder().encode('original bytes'));
    bridge.files.set(`${old}::untracked.txt`, new TextEncoder().encode('keep this too'));
    expect(await rehomeProjectFolders()).toBe(1);
    const current = await folderForCrux(crux.id);
    expect(current).not.toBe(old);
    expect(text(bridge.files.get(`${current}::original.txt`))).toBe('restored bytes');
    expect(text(bridge.files.get(`${old}::original.txt`))).toBe('original bytes');
    expect(text(bridge.files.get(`${old}::untracked.txt`))).toBe('keep this too');
  });

  it('restores manifest content and preserves its file mode without inventing Artifact rows', async () => {
    await initServices();
    const crux = await cruxService.create({ title: 'Manifest restore', type: 'workspace' });
    const snapshot = await cruxService.create({
      title: 'Snapshot',
      type: 'workspace',
      kind: 'snapshot',
    });
    const db = getSqliteClient();
    const bytes = new TextEncoder().encode('Retained binary\0');
    const fingerprint = await hashContent(bytes);
    await db.blobWrite(fingerprint, bytes);
    const head = { cruxId: crux.id, root: 'f'.repeat(64), revision: 1, formatVersion: 1 };
    const list = vi.fn(async () => ({
      head,
      entries: [
        {
          id: 'file',
          path: 'document.bin',
          fingerprint,
          size: bytes.length,
          mimeType: 'application/octet-stream',
          encoding: 'binary',
          mode: 0o640,
          attributes: {},
        },
      ],
    }));
    const content = { head: vi.fn(async () => head), list };
    Object.defineProperty(db, 'fileContent', { configurable: true, value: content });
    const setMode = vi.fn(async () => {});
    Object.assign(bridge.api, { setMode });
    const old = await folderForCrux(crux.id);
    bridge.files.set(`${old}::untracked.txt`, new TextEncoder().encode('Keep'));
    try {
      expect(await rehomeProjectFolders()).toBe(1);
      const folder = await folderForCrux(crux.id);
      expect(folder).not.toBe(old);
      expect(bridge.files.get(`${folder}::document.bin`)).toEqual(bytes);
      expect(setMode).toHaveBeenCalledWith(folder, 'document.bin', 0o640);
      expect(list).toHaveBeenCalledWith({ cruxId: crux.id, expected: head });
      expect(await db.all('SELECT id FROM artifacts WHERE resource_id = ?', [crux.id])).toEqual([]);
      expect(await folderForCrux(snapshot.id)).toBeNull();
      expect(text(bridge.files.get(`${old}::untracked.txt`))).toBe('Keep');
      list.mockRejectedValueOnce(new Error('Missing manifest node'));
      expect(await rehomeProjectFolders()).toBe(0);
      expect(await folderForCrux(crux.id)).toBe(folder);
      expect(bridge.files.get(`${folder}::document.bin`)).toEqual(bytes);
    } finally {
      delete (db as { fileContent?: unknown }).fileContent;
    }
  });

  it('snapshot and mood cruxes get no folder', async () => {
    const snapshot = await cruxService.create({
      title: 'v1',
      type: 'workspace',
      kind: 'snapshot',
    });
    const mood = await cruxService.create({ title: 'Calm', type: 'mood' });
    expect(snapshot.meta?.projectFolder).toBeUndefined();
    expect(mood.meta?.projectFolder).toBeUndefined();
  });

  it('creating an artifact writes the real file', async () => {
    const crux = await cruxService.create({ title: 'Site', type: 'workspace' });
    const artifact = await artifactService.create({
      resourceId: crux.id,
      content: '<h1>hello</h1>',
      meta: { path: 'index.html' },
    });
    expect(artifactRelPath(artifact)).toBe('index.html');
    expect(text(bridge.files.get('/garden/site::index.html'))).toBe('<h1>hello</h1>');
  });

  it('updating content at the same path overwrites the file', async () => {
    const crux = await cruxService.create({ title: 'Site', type: 'workspace' });
    await artifactService.create({
      resourceId: crux.id,
      content: 'v1',
      meta: { path: 'notes/a.md' },
    });
    await artifactService.create({
      resourceId: crux.id,
      content: 'v2',
      meta: { path: 'notes/a.md' },
    });
    expect(text(bridge.files.get('/garden/site::notes/a.md'))).toBe('v2');
  });

  it('renaming an artifact moves the file', async () => {
    const crux = await cruxService.create({ title: 'Site', type: 'workspace' });
    const artifact = await artifactService.create({
      resourceId: crux.id,
      content: 'body',
      meta: { path: 'old.md' },
    });
    await artifactService.update(artifact.id, {
      filename: 'new.md',
      meta: { path: 'new.md' },
    });
    expect(bridge.files.has('/garden/site::old.md')).toBe(false);
    expect(text(bridge.files.get('/garden/site::new.md'))).toBe('body');
  });

  it('deleting an artifact removes the file', async () => {
    const crux = await cruxService.create({ title: 'Site', type: 'workspace' });
    const artifact = await artifactService.create({
      resourceId: crux.id,
      content: 'bye',
      meta: { path: 'temp.txt' },
    });
    await artifactService.delete(artifact.id);
    expect(bridge.files.has('/garden/site::temp.txt')).toBe(false);
  });

  it('projectAllArtifacts rebuilds a deleted folder exactly (restore)', async () => {
    const crux = await cruxService.create({ title: 'Site', type: 'workspace' });
    await artifactService.create({ resourceId: crux.id, content: 'A', meta: { path: 'a.html' } });
    await artifactService.create({
      resourceId: crux.id,
      content: 'B',
      meta: { path: 'sub/b.css' },
    });

    // Simulate the folder being wiped in Finder, plus a stray file appearing
    bridge.files.clear();
    bridge.files.set('/garden/site::stray.txt', new TextEncoder().encode('stray'));

    const folder = await projectAllArtifacts(crux.id);
    expect(folder).toBe('/garden/site');
    expect(text(bridge.files.get('/garden/site::a.html'))).toBe('A');
    expect(text(bridge.files.get('/garden/site::sub/b.css'))).toBe('B');
    expect(bridge.files.has('/garden/site::stray.txt')).toBe(false);
  });

  it('projectFolderExists reflects disk state', async () => {
    const crux = await cruxService.create({ title: 'Here', type: 'workspace' });
    expect(await projectFolderExists(crux.id)).toBe(true);
    bridge.folders.delete('/garden/here');
    expect(await projectFolderExists(crux.id)).toBe(false);
  });

  it('web mode (no bridge) is a complete no-op', async () => {
    delete (globalThis as Record<string, unknown>).window;
    const crux = await cruxService.create({ title: 'Web Crux', type: 'workspace' });
    expect(crux.meta?.projectFolder).toBeUndefined();
    const artifact = await artifactService.create({
      resourceId: crux.id,
      content: 'web',
      meta: { path: 'index.html' },
    });
    expect(artifact.fingerprint).toBeTruthy();
    expect(bridge.files.size).toBe(0);
  });
});
