import { captureGardenId } from '@/stores/gardenContext';
/**
 * Recover — cruxes the account has that this machine does not (RESILIENCE-PLAN
 * §2c): after a restore, on a new device, after a local delete. Two kinds:
 * - synced: an archive in sync storage → Restore brings files and history back;
 * - published only: the served files and the public conversation → Recover
 *   rebuilds a crux from them, marked as recovered (for a Site Crux that is the
 *   built output, and it says so).
 * Reads go through the API modules; writes through the local services.
 */
import { captureAuth, assertAuthCurrent } from '@/api/session';
import { getSqliteClient } from './sqlite/client';
import { getLocalIdentity } from './sqlite/identity';
import { putBlob } from './blobs';
import * as cruxesApi from '@/api/cruxes';
import * as syncApi from '@/api/sync';
import * as publicApi from '@/api/public';
import { getServices } from '@/services';
import { importCrux } from '@/services/crux-io';
import { guessMimeType } from '@/lib/mime';
import type { Crux } from '@/api/types';

export interface CloudOnlyCrux {
  id: string;
  title: string;
  slug: string;
  /** an archive in sync storage — Restore is exact */
  synced: { updatedAt: string; size: number } | null;
  /** the crux record on crux.garden — Recover rebuilds from what it serves */
  published: Crux | null;
}

/** Everything the account holds that the garden does not, newest first. */
export async function listCloudOnlyCruxes(localIds: Set<string>): Promise<CloudOnlyCrux[]> {
  const context = captureAuth();
  const [synced, mine] = await Promise.all([
    syncApi.listSyncedCruxes(context),
    cruxesApi.listAll(context),
  ]);
  const byId = new Map<string, CloudOnlyCrux>();
  for (const s of synced) {
    if (localIds.has(s.cruxId)) continue;
    byId.set(s.cruxId, {
      id: s.cruxId,
      title: s.title || 'Untitled',
      slug: s.slug || s.cruxId,
      synced: { updatedAt: s.updatedAt, size: s.size },
      published: null,
    });
  }
  for (const c of mine) {
    if (localIds.has(c.id)) continue;
    if (!c.meta?.publishedAt) continue; // only what is actually out there
    const row = byId.get(c.id) ?? {
      id: c.id,
      title: c.title || 'Untitled',
      slug: c.slug,
      synced: null,
      published: null,
    };
    row.published = c;
    byId.set(c.id, row);
  }
  return [...byId.values()].sort((a, b) =>
    (b.synced?.updatedAt ?? String(b.published?.meta?.publishedAt ?? '')).localeCompare(
      a.synced?.updatedAt ?? String(a.published?.meta?.publishedAt ?? ''),
    ),
  );
}

/**
 * Pull the archive and import it — files, history, conversation, same id.
 * Archives leave the publish facts out (an importer does not own the
 * deployment — crux-io); this is the owner restoring their own crux, so if the
 * account says it is published, the restored crux knows it too.
 */
export async function restoreSyncedCrux(
  row: Pick<CloudOnlyCrux, 'id' | 'published'>,
  onProgress?: (msg: string) => void,
): Promise<{ cruxId: string; title: string }> {
  onProgress?.('Downloading…');
  const blob = await syncApi.pullCrux(row.id);
  onProgress?.('Importing…');
  const result = await importCrux({ data: blob, mode: 'restore' });
  const meta = row.published?.meta as Record<string, unknown> | undefined;
  if (meta?.publishedAt) {
    const { crux: cruxService } = getServices();
    await cruxService.update(result.cruxId, {
      meta: {
        publishedAt: meta.publishedAt,
        publishedVersion: meta.publishedVersion,
        publishLayout: meta.publishLayout,
      },
    });
  }
  return { cruxId: result.cruxId, title: result.title };
}

/**
 * Rebuild a crux from its published copy: the served files become Artifacts,
 * the public conversation becomes the Collaboration. Keeps the remote id so a
 * later Update reaches the same site. Marks itself as recovered.
 */
export async function recoverPublishedCrux(
  remote: Crux,
  onProgress?: (msg: string) => void,
): Promise<{ cruxId: string; title: string; files: number }> {
  const db = getSqliteClient();
  if (!db.createCrux || !db.fileContent)
    throw new Error('Atomic recovery is unavailable. Restart Garden and retry.');
  const gardenId = captureGardenId();
  const context = captureAuth();
  const identity = await getLocalIdentity();
  onProgress?.('Reading the published site…');
  assertAuthCurrent(context);
  const arts = await publicApi.getArtifacts(remote.authorId, remote.slug);
  const initialFiles = [];
  // Stage immutable bytes first. A refused download/write leaves no partial Crux;
  // unreferenced blobs can be reused on retry without changing existing work.
  for (const a of arts) {
    assertAuthCurrent(context);
    const path = (a.meta?.path as string | undefined) || a.filename || a.id;
    onProgress?.(`Recovering ${path}…`);
    const blob = await publicApi.downloadArtifact(remote.authorId, remote.slug, a.id);
    const fingerprint = await putBlob(blob);
    initialFiles.push({
      put: {
        id: crypto.randomUUID(),
        path,
        fingerprint,
        size: blob.size,
        mimeType: a.mimeType || guessMimeType(path),
        encoding: 'binary',
        mode: 0o644,
        attributes: {},
      },
    });
  }
  assertAuthCurrent(context);
  const meta = (remote.meta ?? {}) as Record<string, unknown>;
  const isSite = remote.kind === 'site' || meta.template === 'astro' || !!meta.site;
  const cruxId = await db.createCrux({
    ...identity,
    initialFiles,
    ...(gardenId ? { gardenId } : {}),
    id: remote.id,
    slug: remote.slug,
    title: remote.title || 'Recovered crux',
    description: remote.description,
    type: 'workspace',
    kind: remote.kind as never,
    data: '',
    meta: {
      messages: Array.isArray(meta.messages) ? meta.messages : [],
      summary: meta.summary ?? null,
      personaSnapshots: meta.personaSnapshots ?? {},
      authorSnapshots: meta.authorSnapshots ?? {},
      tags: meta.tags ?? [],
      publishedAt: meta.publishedAt,
      publishedVersion: meta.publishedVersion,
      recovered: {
        at: new Date().toISOString(),
        from: 'published',
        publishedVersion: meta.publishedVersion ?? null,
        builtOutput: isSite,
      },
    },
  });
  // The complete content is committed. Finish its journaled disk projection;
  // a refused folder write keeps that content and the restartable journal.
  try {
    await db.fileContent.finishProjection(cruxId);
  } catch {
    throw new Error(
      'Your recovered files are saved in Garden, but the Project Folder could not be written. Check folder access and restart Garden to finish recovery.',
    );
  }
  return { cruxId, title: remote.title || 'Recovered crux', files: initialFiles.length };
}
