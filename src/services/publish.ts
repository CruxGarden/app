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
import { pathOf, isWorkspaceThumbnail } from '@/lib/artifact-path';

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
    /**
     * Whether the crux already exists server-side.
     *
     * MUST resolve false only for a genuine "not found", and MUST throw on any
     * other failure (network, 5xx, auth). Publishing takes the create path when
     * this is false, and the API's create hard-deletes any record with the same
     * author+slug — so answering false on a transient error destroys the live
     * published crux.
     */
    exists(cruxId: string): Promise<boolean>;
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

/** True only for a definitive 404 from the API (axios-shaped error). */
function isNotFound(err: unknown): boolean {
  const status = (err as { response?: { status?: number }; status?: number })?.response?.status;
  return status === 404;
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
      exists: async (id) => {
        let found: Crux | undefined;
        try {
          found = await cruxes.get(id);
        } catch (err) {
          if (isNotFound(err)) return false;
          throw err; // transient/auth failure — never assume "not published"
        }
        // axios RESOLVES a response with status 0 (blocked / never answered)
        // as if it succeeded, with an empty body. That is not "exists".
        if (!found || found.id !== id) {
          throw new Error('Could not reach crux.garden to check publish state.');
        }
        return true;
      },
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

/**
 * Workspace-internal files that are never published and must not drive
 * change detection:
 *
 * - `preview.jpg` — the crux thumbnail, re-shot on capture/snapshot. Its JPEG
 *   bytes differ on every capture, so counting it would leave the crux
 *   permanently "changed" after any preview.
 * - `.keep` — the app's empty-directory marker.
 */
export function isInternalArtifactPath(path: string): boolean {
  const p = path.toLowerCase();
  return isWorkspaceThumbnail(p) || p === '.keep' || p.endsWith('/.keep');
}

/** The artifacts a publish actually ships (working files, minus internals). */
export function publishableArtifacts(artifacts: Artifact[]): Artifact[] {
  return artifacts.filter((a) => a.type === 'artifact' && !isInternalArtifactPath(pathOf(a)));
}

/** Build a fingerprint snapshot from artifacts: { path: fingerprint } */
export function buildFingerprintMap(artifacts: Artifact[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of publishableArtifacts(artifacts)) {
    if (!a.fingerprint) continue;
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

// ── Failure reporting ───────────────────────────────────────────────────────

export interface PublishFailure {
  /** One line the user can act on. */
  message: string;
  /** Build output, when the failure came from the site build. */
  log?: string;
}

/**
 * Turn anything the pipeline can throw into something worth showing.
 *
 * Both publish entry points used to swallow errors (`catch {}`), so a failed
 * Astro build — by far the likeliest failure once a crux has a build step —
 * looked exactly like a publish that did nothing at all.
 */
export function describePublishFailure(err: unknown): PublishFailure {
  // SiteBuildError, matched structurally so this module keeps no dependency on
  // the desktop-only build path.
  if (err instanceof Error && err.name === 'SiteBuildError') {
    const log = (err as Error & { log?: string }).log;
    return { message: err.message, ...(log ? { log } : {}) };
  }

  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403) {
    return { message: 'Your account connection expired — reconnect and try again.' };
  }
  if (status === 413) {
    return { message: 'This crux is too large to publish.' };
  }
  if (status) {
    const serverMessage = (err as { response?: { data?: { message?: string | string[] } } })
      ?.response?.data?.message;
    const detail = Array.isArray(serverMessage) ? serverMessage.join(', ') : serverMessage;
    return { message: detail || `The server rejected the publish (${status}).` };
  }

  if (err instanceof Error && err.message) return { message: err.message };
  return { message: 'Publishing failed.' };
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

  // 1. Upsert crux to API (create if not exists, update if it does).
  // A transient failure here aborts the publish: `exists` throwing is the
  // guard that stops us taking the destructive create path (see PublishDeps).
  progress('sync');
  const cruxExistsOnApi = await deps.api.exists(crux.id);
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
    filesToPublish = [];
    // Every publishable artifact must load. Skipping a failed blob would ship
    // an incomplete site while `publishedFingerprints` recorded it as shipped,
    // so the missing file would never be retried.
    for (const art of publishableArtifacts(artifacts)) {
      let blob: Blob;
      try {
        blob = await deps.local.downloadBlob(art.id);
      } catch (err) {
        throw new Error(
          `Could not read "${pathOf(art) || art.id}" from the blob store — nothing was published.`,
          { cause: err },
        );
      }
      filesToPublish.push({
        blob,
        path: pathOf(art) || 'file',
        type: art.type,
        kind: art.kind || undefined,
        mimeType: art.mimeType,
      });
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
    const tags = crux.discoverable ? (crux.meta?.tags as string[]) || [] : [];
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
export async function unpublishPipeline(crux: Crux, opts?: { deps?: PublishDeps }): Promise<Crux> {
  const deps = opts?.deps ?? (await defaultDeps());

  await deps.api.unpublish(crux.id);

  const meta = { ...(crux.meta as Record<string, unknown>) };
  delete meta.publishedAt;
  delete meta.publishedVersion;
  delete meta.publishedFingerprints;
  await deps.local.updateCruxMeta(crux.id, meta);

  return { ...crux, meta: meta as Crux['meta'], visibility: 'private' };
}
