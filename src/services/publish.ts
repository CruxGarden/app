/**
 * Publish module — the whole publish/unpublish pipeline behind one interface.
 *
 * Owns: API upsert, Site Crux build-at-publish (ADR 0005), blob collection,
 * the multipart upload, publish-fingerprint snapshotting, local meta
 * persistence, and tag sync. Callers (the workspace store) hand in the crux +
 * artifacts and get the updated crux back — no publish knowledge leaks out.
 *
 * Adapters are injectable (`PublishDeps`) so the pipeline is testable without
 * a server, a builder, or SQLite; production callers omit `deps`.
 */

import type { Crux, Artifact } from '@/api/types';
import { pathOf } from '@/lib/artifact-path';

export interface PublishFile {
  blob: Blob;
  path: string;
  type?: string;
  kind?: string;
  mimeType: string;
}

export type PublishPhase = 'sync' | 'build' | 'collect' | 'upload' | 'finalize' | 'tags';

export interface PublishDeps {
  api: {
    get(cruxId: string): Promise<Crux>;
    create(input: Record<string, unknown>): Promise<Crux>;
    update(cruxId: string, input: Record<string, unknown>): Promise<Crux>;
    publish(cruxId: string, files: PublishFile[]): Promise<Crux>;
    unpublish(cruxId: string): Promise<Crux>;
    syncTags(cruxId: string, tags: string[]): Promise<unknown>;
  };
  local: {
    updateCruxMeta(cruxId: string, meta: Record<string, unknown>): Promise<unknown>;
    downloadBlob(artifactId: string): Promise<Blob>;
  };
  site: {
    isSiteCrux(artifacts: Artifact[]): boolean;
    buildForPublish(cruxId: string): Promise<PublishFile[]>;
  };
}

async function defaultDeps(): Promise<PublishDeps> {
  const [{ cruxes }, { getServices }, site] = await Promise.all([
    import('@/api'),
    import('./index'),
    import('./site'),
  ]);
  const { artifact, crux: cruxService } = getServices();
  return {
    api: {
      get: (id) => cruxes.get(id),
      create: (input) => cruxes.create(input as unknown as Parameters<typeof cruxes.create>[0]),
      update: (id, input) => cruxes.update(id, input as Parameters<typeof cruxes.update>[1]),
      publish: (id, files) => cruxes.publish(id, files),
      unpublish: (id) => cruxes.unpublish(id),
      syncTags: (id, tags) => cruxes.syncTags(id, tags),
    },
    local: {
      updateCruxMeta: (id, meta) => cruxService.update(id, { meta }),
      downloadBlob: (id) => artifact.downloadBlob(id),
    },
    site: {
      isSiteCrux: site.isSiteCrux,
      buildForPublish: site.buildForPublish,
    },
  };
}

// ── Publish-state helpers (fingerprint snapshot & change detection) ─────────

/** Build a fingerprint snapshot from artifacts: { path: fingerprint } */
export function buildFingerprintMap(artifacts: Artifact[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of artifacts) {
    if (a.type !== 'artifact' || !a.fingerprint) continue;
    map[pathOf(a)] = a.fingerprint;
  }
  return map;
}

/** Check if current artifacts differ from the published fingerprint snapshot */
export function hasContentChanged(
  artifacts: Artifact[],
  publishedFingerprints: Record<string, string> | undefined,
): boolean {
  if (!publishedFingerprints) return true; // never published
  const current = buildFingerprintMap(artifacts);
  const currentKeys = Object.keys(current).sort();
  const publishedKeys = Object.keys(publishedFingerprints).sort();
  if (currentKeys.length !== publishedKeys.length) return true;
  for (let i = 0; i < currentKeys.length; i++) {
    if (currentKeys[i] !== publishedKeys[i]) return true;
    if (current[currentKeys[i]!] !== publishedFingerprints[currentKeys[i]!]) return true;
  }
  return false;
}

// ── The pipeline ────────────────────────────────────────────────────────────

function cruxUpsertFields(crux: Crux): Record<string, unknown> {
  return {
    title: crux.title,
    slug: crux.slug,
    description: crux.description,
    data: crux.data,
    type: crux.type,
    kind: crux.kind,
    discoverable: crux.discoverable,
    meta: crux.meta as Record<string, unknown>,
  };
}

/**
 * Publish a crux. Returns the updated crux (API publish metadata + fresh
 * publishedFingerprints merged into meta, persisted locally).
 */
export async function publishPipeline(
  crux: Crux,
  artifacts: Artifact[],
  opts?: { onProgress?: (phase: PublishPhase) => void; deps?: PublishDeps },
): Promise<Crux> {
  const deps = opts?.deps ?? (await defaultDeps());
  const progress = opts?.onProgress ?? (() => {});

  // 1. Upsert crux to API (create if not exists, update if it does)
  progress('sync');
  let cruxExistsOnApi = false;
  try {
    await deps.api.get(crux.id);
    cruxExistsOnApi = true;
  } catch {
    // 404 — crux not yet on API
  }
  if (cruxExistsOnApi) {
    await deps.api.update(crux.id, cruxUpsertFields(crux));
  } else {
    // The API handles slug conflicts by hard-deleting stale records
    await deps.api.create({ id: crux.id, ...cruxUpsertFields(crux), data: crux.data || '' });
  }

  // 2. Collect the files to publish.
  // Site Cruxes (ADR 0005): build in-app and ship dist/ — sources stay in
  // history, visitors get the built output. A failed build fails the
  // publish; nothing half-deploys.
  let filesToPublish: PublishFile[];
  if (deps.site.isSiteCrux(artifacts)) {
    progress('build');
    filesToPublish = await deps.site.buildForPublish(crux.id);
  } else {
    progress('collect');
    const workingArtifacts = artifacts.filter((a) => a.type === 'artifact');
    filesToPublish = [];
    for (const art of workingArtifacts) {
      try {
        const blob = await deps.local.downloadBlob(art.id);
        filesToPublish.push({
          blob,
          path: pathOf(art) || 'file',
          type: art.type,
          kind: art.kind || undefined,
          mimeType: art.mimeType,
        });
      } catch {
        // Skip artifacts that fail to load — publish will use what's available
      }
    }
  }

  // 3. Publish — all files in one multipart request
  progress('upload');
  const updated = await deps.api.publish(crux.id, filesToPublish);

  // 4. Merge API publish metadata into the local crux (preserving local-only
  // meta) and snapshot fingerprints for change detection; persist locally.
  progress('finalize');
  const publishedFingerprints = buildFingerprintMap(artifacts);
  const mergedMeta = {
    ...(crux.meta as Record<string, unknown>),
    ...(updated.meta as Record<string, unknown>),
    publishedFingerprints,
  };
  await deps.local.updateCruxMeta(crux.id, mergedMeta);
  const mergedCrux: Crux = { ...crux, ...updated, meta: mergedMeta as Crux['meta'] };

  // 5. Sync discoverable state and tags (best-effort — publish itself succeeded)
  progress('tags');
  try {
    const tags = crux.discoverable ? ((crux.meta?.tags as string[]) || []) : [];
    await deps.api.syncTags(crux.id, tags);
  } catch {
    // best-effort
  }

  return mergedCrux;
}

/**
 * Unpublish a crux: removes published files and the API-side record, clears
 * publish metadata locally (persisted — not just in-memory), returns the
 * updated crux.
 */
export async function unpublishPipeline(
  crux: Crux,
  opts?: { deps?: PublishDeps },
): Promise<Crux> {
  const deps = opts?.deps ?? (await defaultDeps());

  await deps.api.unpublish(crux.id);

  const meta = { ...(crux.meta as Record<string, unknown>) };
  delete meta.publishedAt;
  delete meta.publishedVersion;
  delete meta.publishedFingerprints;
  await deps.local.updateCruxMeta(crux.id, meta);

  return { ...crux, meta: meta as Crux['meta'], visibility: 'private' };
}
