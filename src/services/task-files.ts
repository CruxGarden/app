import { getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { guessMimeType, hashContent } from './sqlite/helpers';
import { folderForCrux } from './project-folder';
import { flushIngestion, expectProjectWrites } from './ingestion';
import {
  isTaskArtifact,
  sameTaskFile,
  validateTaskPaths,
  type TaskManifest,
} from './task-manifest';

export async function indexedTaskManifest(id: string): Promise<TaskManifest> {
  const files = await getServices().artifact.findByResource('crux', id);
  const manifest: TaskManifest = {};
  for (const f of files) {
    const path = String(f.meta?.path || f.filename);
    if (f.type === 'artifact' && f.fingerprint && isTaskArtifact(path))
      manifest[path] = {
        fingerprint: f.fingerprint,
        mimeType: f.mimeType,
        encoding: f.encoding,
        mode: Number(f.meta?.mode ?? 0o644),
        ...(typeof f.size === 'number' ? { size: f.size } : {}),
      };
  }
  validateTaskPaths(manifest);
  return manifest;
}

/** Capture disk, not a possibly lagging Artifact index. Call with writers settled. */
export async function captureTaskManifest(id: string): Promise<TaskManifest> {
  await flushIngestion();
  const folder = await folderForCrux(id);
  if (!folder) return indexedTaskManifest(id);
  const api = window.electronAPI?.project;
  if (!api?.capture) throw new Error('Restart the updated desktop app to capture a task.');
  const files = await api.capture(folder);
  const manifest: TaskManifest = {};
  for (const file of files) {
    if (!isTaskArtifact(file.path)) continue;
    const data = new Uint8Array(file.data);
    const fingerprint = await hashContent(data);
    await getSqliteClient().blobWrite(fingerprint, data);
    const mimeType = guessMimeType(file.path);
    let text = /^(text\/|application\/(json|javascript|xml|x-sh)|image\/svg)/.test(mimeType);
    if (text) {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(data);
      } catch {
        text = false; // Preserve non-UTF-8 files byte-for-byte as binary Artifacts.
      }
    }
    manifest[file.path] = {
      fingerprint,
      mimeType,
      encoding: text ? 'utf-8' : 'binary',
      mode: file.mode,
    };
  }
  validateTaskPaths(manifest);
  return manifest;
}

/** Record captured disk content without echoing writes back to disk. */
export async function indexTaskManifest(id: string, manifest: TaskManifest): Promise<void> {
  validateTaskPaths(manifest);
  const { artifact } = getServices();
  const current = await artifact.findByResource('crux', id);
  for (const f of current) {
    const path = String(f.meta?.path || f.filename);
    if (isTaskArtifact(path) && !manifest[path])
      await artifact.delete(f.id, { writeThrough: false });
  }
  // New paths whose blobs the store already holds (the manifest came from
  // indexed Artifacts) are registered in bulk: no reads, no hashing, a few
  // inserts instead of thousands of round-trips. A 400 MB native app took
  // minutes to index one file at a time.
  const byPath = new Map(current.map((a) => [String(a.meta?.path || a.filename), a]));
  const fresh = Object.entries(manifest).filter(
    ([path, f]) => !byPath.has(path) && f.size !== undefined,
  );
  await artifact.registerMany(
    fresh.map(([path, f]) => ({
      resourceId: id,
      path,
      fingerprint: f.fingerprint,
      size: f.size!,
      mimeType: f.mimeType,
      encoding: f.encoding,
      meta: { path, mode: f.mode },
    })),
  );
  const registered = new Set(fresh.map(([path]) => path));
  for (const [path, f] of Object.entries(manifest)) {
    if (registered.has(path)) continue;
    const previous = byPath.get(path);
    if (previous?.fingerprint === f.fingerprint && previous.meta?.mode === f.mode) continue;
    const data = await getSqliteClient().blobRead(f.fingerprint);
    if (f.encoding === 'utf-8')
      await artifact.create({
        resourceId: id,
        content: new TextDecoder().decode(data),
        mimeType: f.mimeType,
        meta: { path, mode: f.mode },
        writeThrough: false,
      });
    else
      await artifact.upload({
        resourceId: id,
        blob: new Blob([data as BlobPart]),
        mimeType: f.mimeType,
        meta: { path, mode: f.mode },
        writeThrough: false,
      });
    await getSqliteClient().run(
      'UPDATE artifacts SET meta = ? WHERE resource_id = ? AND path = ?',
      [JSON.stringify({ path, mode: f.mode }), id, path],
    );
  }
}

/** Explicit projection only. Any failed write aborts; caller owns recovery. */
export async function projectTaskManifest(
  id: string,
  before: TaskManifest,
  after: TaskManifest,
): Promise<void> {
  validateTaskPaths(after);
  const folder = await folderForCrux(id);
  if (folder) {
    const api = window.electronAPI!.project;
    await api.ensureFolder(folder);
    for (const path of Object.keys(before).sort((a, b) => b.length - a.length))
      if (!after[path]) await api.deleteFile(folder, path);
    const changed = Object.entries(after).filter(([path, f]) => !sameTaskFile(before[path], f));
    expectProjectWrites(
      folder,
      changed.map(([path, f]) => ({ relPath: path, fingerprint: f.fingerprint })),
    );
    if (api.materialize) {
      // One main-process copy from the Blob Store per batch; no bytes cross the renderer.
      for (let start = 0; start < changed.length; start += 2000)
        await api.materialize(
          folder,
          changed
            .slice(start, start + 2000)
            .map(([path, f]) => ({ path, fingerprint: f.fingerprint, mode: f.mode })),
        );
    } else
      for (const [path, f] of changed) {
        await api.writeFile(folder, path, await getSqliteClient().blobRead(f.fingerprint));
        await api.setMode?.(folder, path, f.mode);
      }
  }
  await indexTaskManifest(id, after);
}
