/**
 * Ingestion service (ADR 0001 — disk → store, the only background direction).
 *
 * Receives debounced change batches from the main-process watcher and records
 * external edits in the canonical store: fingerprint the file, skip if the
 * store already has that content (echo), otherwise create/update the artifact
 * row + blob through the artifact service with `writeThrough: false` — the
 * content is already on disk, and background flow never writes disk.
 *
 * Batches process strictly serially; `flushIngestion()` resolves when the
 * queue is empty — auto-snapshot MUST await it before capturing (a snapshot
 * taken mid-ingest would record a half-observed state).
 */

import { Capability, can, type ProjectBridge, type ChangeBatch } from '@/lib/platform';
import { getSqliteClient } from './sqlite/client';
import { guessMimeType, hashContent } from './sqlite/helpers';
import { getServices } from './index';

function bridge(): ProjectBridge | null {
  if (!can(Capability.ProjectFolder)) return null;
  return window.electronAPI?.project ?? null;
}

// ── Folder → crux resolution ────────────────────────────────────────────────

const folderToCrux = new Map<string, string>();

async function cruxIdForFolder(folder: string): Promise<string | null> {
  if (folderToCrux.has(folder)) return folderToCrux.get(folder)!;
  const db = getSqliteClient();
  const rows = await db.all<{ id: string; meta: string | null }>(
    "SELECT id, meta FROM cruxes WHERE type = 'workspace'",
  );
  for (const row of rows) {
    try {
      const meta = JSON.parse(row.meta || '{}');
      if (typeof meta.projectFolder === 'string') folderToCrux.set(meta.projectFolder, row.id);
    } catch {
      /* skip bad meta */
    }
  }
  return folderToCrux.get(folder) ?? null;
}

// ── Text vs binary ──────────────────────────────────────────────────────────

const TEXTUAL_MIME = /^(text\/|application\/(json|javascript|xml|x-sh))/;

function isProbablyText(bytes: Uint8Array, mime: string): boolean {
  if (TEXTUAL_MIME.test(mime)) return true;
  if (mime !== 'application/octet-stream') return false;
  // Unknown extension: sniff the first 8KB for null bytes
  const sample = bytes.subarray(0, 8192);
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return false;
  }
  return true;
}

// ── Serial queue ────────────────────────────────────────────────────────────

let queueTail: Promise<void> = Promise.resolve();
let unsubscribe: (() => void) | null = null;

function enqueue(fn: () => Promise<void>): void {
  queueTail = queueTail.then(fn).catch((err) => {
    console.error('[ingestion] batch failed:', err);
  });
}

/** Resolves when all currently queued ingestion work has completed. */
export function flushIngestion(): Promise<void> {
  return queueTail;
}

/** Notify interested UI (Artifacts panel, workshop) that a crux's files changed. */
function announceChange(cruxId: string): void {
  window.dispatchEvent(new CustomEvent('crux:external-change', { detail: { cruxId } }));
}

/** Notify that a Project Folder disappeared (never cascades to deletion). */
function announceFolderMissing(folder: string, cruxId: string | null): void {
  console.warn(`[ingestion] Project Folder missing: ${folder} — artifacts preserved`);
  window.dispatchEvent(new CustomEvent('crux:folder-missing', { detail: { folder, cruxId } }));
}

// ── Batch processing ────────────────────────────────────────────────────────

async function processBatch(batch: ChangeBatch): Promise<void> {
  const api = bridge();
  if (!api) return;

  const cruxId = await cruxIdForFolder(batch.folder);

  if (batch.folderMissing) {
    announceFolderMissing(batch.folder, cruxId);
    return;
  }
  if (!cruxId) return; // folder not registered to any crux — nothing to record

  const db = getSqliteClient();
  const { artifact } = getServices();
  let changed = false;

  for (const event of batch.events) {
    try {
      if (event.type === 'mkdir') {
        // An external empty folder becomes a `.keep` artifact — the app's own
        // empty-folder convention. Only when genuinely empty: directories
        // created as a side effect of file writes (or with contents arriving
        // in this batch) must not get `.keep` noise.
        const prefix = event.relPath + '/';
        const hasBatchFiles = batch.events.some(
          (e) => e.type === 'write' && e.relPath.startsWith(prefix),
        );
        const hasArtifacts = await db.get<{ n: number }>(
          "SELECT COUNT(*) as n FROM artifacts WHERE resource_id = ? AND type = 'artifact' AND path LIKE ?",
          [cruxId, prefix + '%'],
        );
        if (hasBatchFiles || (hasArtifacts?.n ?? 0) > 0) continue;
        const keepPath = `${event.relPath}/.keep`;
        // .keep write-through is intentional here (matches in-app folder creation)
        await artifact.create({ resourceId: cruxId, content: '', meta: { path: keepPath } });
        changed = true;
        continue;
      }

      if (event.type === 'rmdir') {
        const keepPath = `${event.relPath}/.keep`;
        const row = await db.get<{ id: string }>(
          "SELECT id FROM artifacts WHERE resource_id = ? AND path = ? AND type = 'artifact'",
          [cruxId, keepPath],
        );
        if (row) {
          await artifact.delete(row.id, { writeThrough: false });
          changed = true;
        }
        continue;
      }

      if (event.type === 'delete') {
        const row = await db.get<{ id: string }>(
          "SELECT id FROM artifacts WHERE resource_id = ? AND path = ? AND type = 'artifact'",
          [cruxId, event.relPath],
        );
        if (row) {
          await artifact.delete(row.id, { writeThrough: false });
          changed = true;
        }
        continue;
      }

      // write
      let bytes: Uint8Array;
      try {
        bytes = await api.readFile(batch.folder, event.relPath);
      } catch {
        continue; // deleted again before we read it — the delete event follows
      }

      // Echo/no-op guard: content the store already has is not a change
      const fingerprint = await hashContent(bytes);
      const existing = await db.get<{ fingerprint: string | null }>(
        "SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ? AND type = 'artifact'",
        [cruxId, event.relPath],
      );
      if (existing?.fingerprint === fingerprint) continue;

      const mime = guessMimeType(event.relPath);
      // writeThrough: false — the content is already on disk, and writing it
      // back could clobber an even newer external save (ADR 0001).
      if (isProbablyText(bytes, mime)) {
        await artifact.create({
          resourceId: cruxId,
          content: new TextDecoder().decode(bytes),
          mimeType: mime === 'application/octet-stream' ? 'text/plain' : mime,
          meta: { path: event.relPath },
          writeThrough: false,
        });
      } else {
        await artifact.upload({
          resourceId: cruxId,
          blob: new Blob([bytes as BlobPart], { type: mime }),
          mimeType: mime,
          meta: { path: event.relPath },
          writeThrough: false,
        });
      }
      changed = true;
    } catch (err) {
      console.error(`[ingestion] failed to ingest ${event.relPath}:`, err);
    }
  }

  if (changed) announceChange(cruxId);
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

/** Start listening for external changes. No-op on web. Idempotent. */
export function initIngestion(): void {
  if (unsubscribe) return;
  const api = bridge();
  if (!api?.onChanged) return;
  unsubscribe = api.onChanged((batch) => enqueue(() => processBatch(batch)));
}

/** Stop listening (tests / teardown). */
export function stopIngestion(): void {
  unsubscribe?.();
  unsubscribe = null;
  folderToCrux.clear();
}
