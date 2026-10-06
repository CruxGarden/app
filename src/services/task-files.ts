import { getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { guessMimeType, hashContent } from './sqlite/helpers';
import { folderForCrux } from './project-folder';
import { flushIngestion, expectProjectWrites, serializeIngestion } from './ingestion';
import {
  isTaskArtifact,
  sameTaskFile,
  validateTaskPaths,
  type TaskManifest,
} from './task-manifest';

/** Read the API-retained starting files; never reconstruct them from mutable Main. */
export async function startingTaskManifest(id: string): Promise<TaskManifest> {
  const read = getSqliteClient().workingCopyBase;
  if (!read) throw new Error('Task starting-state inspection is unavailable.');
  const base = await read(id);
  const manifest: TaskManifest = {};
  for (const entry of base.entries) {
    if (!isTaskArtifact(entry.path)) continue;
    const { fingerprint, mimeType, encoding, mode, size } = entry;
    manifest[entry.path] = { fingerprint, mimeType, encoding, mode, size };
  }
  validateTaskPaths(manifest);
  return manifest;
}

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

const TEXT_MIME = /^(text\/|application\/(json|javascript|xml|x-sh)|image\/svg)/;

/** Capture disk, not a possibly lagging Artifact index. Call with writers settled. */
export async function captureTaskManifest(id: string): Promise<TaskManifest> {
  await flushIngestion();
  const folder = await folderForCrux(id);
  if (!folder) return indexedTaskManifest(id);
  const api = window.electronAPI?.project;
  if (api?.captureManifest) {
    // Hashed in the main process against a stat-signature cache: a reopened
    // 2,000-file tool costs one hashing pass, later captures a stat walk, and
    // no bytes cross IPC. Reading every file into the renderer and hashing it
    // there kept a 151 MB Crux's export on "Saving files…" for minutes.
    const indexed = await indexedTaskManifest(id);
    const captured = await api.captureManifest(folder, Object.keys(indexed));
    const manifest: TaskManifest = {};
    for (const file of captured.files) {
      if (!isTaskArtifact(file.path)) continue;
      const known = indexed[file.path];
      // Unchanged bytes keep their indexed type: re-deriving it (a bundled
      // asset registered as binary reads as UTF-8 text) moved the head on
      // every export, and the embedded tool reloaded itself mid-export.
      if (known && known.fingerprint === file.fingerprint) {
        manifest[file.path] = { ...known, mode: file.mode, size: file.size };
        continue;
      }
      const mimeType = guessMimeType(file.path);
      manifest[file.path] = {
        fingerprint: file.fingerprint,
        mimeType,
        encoding: file.utf8 && TEXT_MIME.test(mimeType) ? 'utf-8' : 'binary',
        mode: file.mode,
        size: file.size,
      };
    }
    // Indexed paths the folder's ignore rules cover (a tool's `runtime/`) are
    // the index's own: the folder is not their truth, so a capture neither
    // reads nor drops them. Dropping them emptied the Workshop after an export
    // and left complete archives without the tool they claimed to hold.
    for (const path of captured.retained)
      if (indexed[path] && !manifest[path]) manifest[path] = indexed[path];
    validateTaskPaths(manifest);
    return manifest;
  }
  if (!api?.capture) throw new Error('Restart the updated desktop app to capture a task.');
  const files = await api.capture(folder);
  const manifest: TaskManifest = {};
  for (const file of files) {
    if (!isTaskArtifact(file.path)) continue;
    const data = new Uint8Array(file.data);
    const fingerprint = await hashContent(data);
    await getSqliteClient().blobWrite(fingerprint, data);
    const mimeType = guessMimeType(file.path);
    let text = TEXT_MIME.test(mimeType);
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
  if (!getSqliteClient().fileContent)
    throw new Error('Task file storage is unavailable. Restart the updated desktop app.');
  validateTaskPaths(manifest);
  const captured = structuredClone(manifest);
  return serializeIngestion(() => indexTaskManifestCore(id, captured));
}

async function indexTaskManifestCore(id: string, manifest: TaskManifest): Promise<void> {
  const db = getSqliteClient();
  if (!db.fileContent) throw new Error('Task file storage is unavailable.');
  const head = await db.fileContent.head(id);
  const entries = head ? (await db.fileContent.list({ cruxId: id, expected: head })).entries : [];
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const changes: Parameters<typeof db.fileContent.edit>[0]['changes'] = entries
    .filter((entry) => isTaskArtifact(entry.path) && !manifest[entry.path])
    .map((entry) => ({ remove: entry.path }));
  for (const [path, file] of Object.entries(manifest)) {
    const previous = byPath.get(path);
    if (
      previous &&
      sameTaskFile(previous, file) &&
      previous.mimeType === file.mimeType &&
      previous.encoding === file.encoding
    )
      continue;
    changes.push({
      put: {
        ...file,
        path,
        id: previous?.id ?? crypto.randomUUID(),
        size: file.size ?? (await db.blobRead(file.fingerprint)).byteLength,
        attributes: previous?.attributes ?? {},
      },
    });
  }
  if (changes.length || !head) await db.fileContent.edit({ cruxId: id, expected: head, changes });
}

/** Explicit projection only. Any failed write aborts; caller owns recovery. */
export async function projectTaskManifest(
  id: string,
  before: TaskManifest,
  after: TaskManifest,
): Promise<void> {
  if (!getSqliteClient().fileContent)
    throw new Error('Task file storage is unavailable. Restart the updated desktop app.');
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
