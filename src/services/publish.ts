import { isEmbeddedApp, isMoqira } from './embedded-app';
import { publicationPlan, publishableArtifacts } from './publication-plan';
export { isInternalArtifactPath, publishableArtifacts } from './publication-plan';
import { portableMeta } from './portable-metadata';
import { downloadPublicationBlob } from './publication-files';
import { packTool, openToolPackage, TOOL_PACKAGE_PATH } from './crux-tools/package';
import { manifestFor } from './crux-tools/registry';
import { parseManifest } from './crux-tools/manifest';
import { assertCopyWritable } from './working-copies';
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

import type { Crux, Artifact, ChatMessage } from '@/api/types';
import { captureAuth, assertAuthCurrent, type AuthContext } from '@/api/session';
import { pathOf, isWorkspaceThumbnail } from '@/lib/artifact-path';
import { PUBLIC_COVER_PATH } from '@/lib/public-cover';

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
     * this is false. Create refuses an occupied identity or author slug, so
     * availability failures must not be misreported as missing content.
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
    downloadBlob(artifact: Artifact): Promise<Blob>;
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

async function defaultDeps(context: AuthContext): Promise<PublishDeps> {
  const [{ cruxes }, { getServices }, site] = await Promise.all([
    import('@/api'),
    import('./index'),
    import('./site'),
  ]);
  const { crux: cruxService } = getServices();
  return {
    api: {
      exists: async (id) => {
        let found: Crux | undefined;
        try {
          found = await cruxes.get(id, context);
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
      create: (input) =>
        cruxes.create(input as unknown as Parameters<typeof cruxes.create>[0], context),
      update: (id, input) =>
        cruxes.update(id, input as Parameters<typeof cruxes.update>[1], context),
      publish: (id, files) => cruxes.publish(id, files, context),
      unpublish: (id) => cruxes.unpublish(id, context),
      syncTags: (id, tags) => cruxes.syncTags(id, tags, context),
    },
    local: {
      updateCruxMeta: (id, meta) => cruxService.update(id, { meta }),
      downloadBlob: downloadPublicationBlob,
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
 * - `AGENTS.md` / `CLAUDE.md` — the generated agent guide (B1): documentation
 *   for whoever works in the folder, not part of the site.
 */
/** Build a fingerprint snapshot from artifacts: { path: fingerprint } */
export function buildFingerprintMap(artifacts: Artifact[], crux?: Crux): Record<string, string> {
  const map: Record<string, string> = {};
  const plan = crux ? publicationPlan(crux, artifacts) : null;
  const files =
    plan?.kind === 'static'
      ? plan.files
      : publishableArtifacts(artifacts).map((file) => ({ file, path: pathOf(file) }));
  for (const { file, path } of files) {
    if (!file.fingerprint) continue;
    map[path] = file.fingerprint;
  }
  return map;
}

/** Check if current artifacts differ from the published fingerprint snapshot */
export function hasContentChanged(
  artifacts: Artifact[],
  publishedFingerprints: Record<string, string> | undefined,
  crux?: Crux,
): boolean {
  if (!publishedFingerprints) return true; // never published
  if (crux && publicationPlan(crux, artifacts).kind === 'unavailable') return true;
  const current = buildFingerprintMap(artifacts, crux);
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
  if (status === 402) {
    const serverMessage = (err as { response?: { data?: { message?: string } } })?.response?.data
      ?.message;
    return {
      message:
        (typeof serverMessage === 'string' && serverMessage) ||
        'This publish is over your plan’s storage. Free up space or upgrade in Settings → Plan.',
    };
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

export function cruxUpsertFields(crux: Crux, messages?: ChatMessage[]): Record<string, unknown> {
  const publicMeta = portableMeta(crux.meta);
  // Garden Collaboration is private workspace state, never a public making-of transcript.
  delete publicMeta.gardenCollaboration;
  delete publicMeta.gardenSchedules;
  return {
    title: crux.title,
    slug: crux.slug,
    description: crux.description,
    data: isEmbeddedApp(crux) ? '' : crux.data,
    type: crux.type,
    kind: crux.kind,
    discoverable: crux.discoverable,
    meta: isEmbeddedApp(crux)
      ? { messages: [] }
      : { ...publicMeta, ...(messages ? { messages } : {}) },
  };
}

/**
 * Publish a crux. Returns the updated crux (API publish metadata + fresh
 * publishedFingerprints merged into meta, persisted locally).
 */
export async function publishPipeline(
  crux: Crux,
  artifacts: Artifact[],
  opts?: {
    onProgress?: (phase: PublishPhase) => void;
    deps?: PublishDeps;
    messages?: ChatMessage[];
    /** Captured before workspace preparation; direct callers capture at pipeline entry. */
    authContext?: AuthContext;
  },
): Promise<Crux> {
  const context = opts?.authContext ?? captureAuth();
  assertAuthCurrent(context);
  artifacts = structuredClone(artifacts);
  const plan = publicationPlan(crux, artifacts, opts?.deps?.site.isSiteCrux(artifacts));
  if (plan.kind === 'unavailable') throw new Error(plan.explanation);
  if (plan.kind === 'garden-package')
    throw new Error(
      'Share this workspace with Export Garden or Export this Crux. Its editable archive is not a public website.',
    );
  if (crux.type === 'working-copy' || crux.meta?.workingCopy)
    throw new Error('Publish from Main after merging this task.');
  if (!opts?.deps) await assertCopyWritable(crux.id);
  const deps = opts?.deps ?? (await defaultDeps(context));
  const progress = opts?.onProgress ?? (() => {});
  if (crux.kind === 'notes' && plan.kind === 'build') {
    const manifest = artifacts.find((a) => pathOf(a) === 'notebook/publish.json');
    if (!manifest) throw new Error('The notebook publication settings are missing.');
    const selected = JSON.parse(await (await deps.local.downloadBlob(manifest)).text());
    if (!Array.isArray(selected.pages) || !selected.pages.length)
      throw new Error(
        'Select at least one note with “Include in public edition” before publishing.',
      );
    if (
      selected.pages.some(
        (path: unknown) =>
          typeof path !== 'string' ||
          !/\.md$/i.test(path) ||
          !artifacts.some((a) => pathOf(a) === 'notebook/' + path),
      )
    )
      throw new Error(
        'A selected public note is missing. Update the notebook publication settings.',
      );
  }

  if (plan.kind === 'build' && isMoqira(crux)) {
    const readJson = async (path: string) => {
      const artifact = artifacts.find((a) => pathOf(a) === path);
      if (!artifact) throw new Error('Moqira publication files are missing.');
      return JSON.parse(await (await deps.local.downloadBlob(artifact)).text());
    };
    const selected = await readJson('mockups/publish.json');
    const project = await readJson('mockups/project.json');
    if (!Array.isArray(selected.wireframes) || !selected.wireframes.length)
      throw new Error(
        'Select at least one wireframe with “Include in public edition” before publishing.',
      );
    if (
      selected.wireframes.some(
        (id: unknown) => !project.wireframes?.some((frame: { id: string }) => frame.id === id),
      )
    )
      throw new Error('A selected public wireframe is missing. Update the publication settings.');
  }

  // A creator-owned manifest takes precedence over the build's catalogue.
  // Resolve before any remote mutation so invalid authoring fails locally.
  let publishedToolManifest = crux.kind === 'tool' ? manifestFor(crux) : null;
  if (crux.kind === 'tool') {
    const definition = artifacts.find((a) => pathOf(a) === 'crux-tool.json');
    if (definition)
      publishedToolManifest = parseManifest(
        JSON.parse(await (await deps.local.downloadBlob(definition)).text()),
      );
    if (!publishedToolManifest)
      throw new Error('Add a valid crux-tool.json before sharing a Tool template.');
    crux = {
      ...crux,
      meta: {
        ...crux.meta,
        template: publishedToolManifest.id,
        toolManifest: publishedToolManifest,
      },
    };
  }

  // 1. Collect immutable publication bytes before any remote request.
  // Watcher ingestion may advance the selected manifest during network I/O;
  // reading afterward would reject even an unrelated internal-file update.
  // Site Cruxes (ADR 0005): build in-app and ship dist/ — sources stay in
  // history, visitors get the built output. A failed build fails the
  // publish; nothing half-deploys.
  let filesToPublish: PublishFile[];
  // Moqira and Notes publish their own public edition builds (ADR 0029, 0028) without an Astro config.
  // form-js Cruxes publish the viewer edition their own script renders (formjs-crux/scripts/edition.mjs).
  // Tool templates distribute their complete editor/runtime package, even when
  // projects made with the tool have a separate public-edition build.
  if (plan.kind === 'build') {
    progress('build');
    filesToPublish = await deps.site.buildForPublish(crux.id);
  } else {
    progress('collect');
    filesToPublish = [];
    // Every publishable artifact must load. Skipping a failed blob would ship
    // an incomplete site while `publishedFingerprints` recorded it as shipped,
    // so the missing file would never be retried.
    for (const { file: art, path } of plan.files) {
      let blob: Blob;
      try {
        blob = await deps.local.downloadBlob(art);
      } catch (err) {
        throw new Error(
          `Could not read "${pathOf(art) || art.id}" from the blob store — nothing was published.`,
          { cause: err },
        );
      }
      filesToPublish.push({
        blob,
        path,
        type: art.type,
        kind: art.kind || undefined,
        mimeType: art.mimeType,
      });
    }
  }

  // 1b. The cover: ship the workspace thumbnail as _crux/cover.jpg so Explore
  // and public pages can show it. Best-effort — a missing or unreadable
  // preview never blocks a publish. A file the user (or the site build) put at
  // that path wins; we never overwrite their bytes with ours.
  const thumb = isEmbeddedApp(crux)
    ? undefined
    : artifacts.find((a) => a.type === 'artifact' && isWorkspaceThumbnail(pathOf(a)));
  const coverTaken = filesToPublish.some((f) => f.path === PUBLIC_COVER_PATH);
  if (thumb && coverTaken) {
    console.warn(`[publish] ${PUBLIC_COVER_PATH} exists in the crux — not shipping the thumbnail`);
  }
  if (thumb && !coverTaken) {
    try {
      const blob = await deps.local.downloadBlob(thumb);
      if (blob.size > 0)
        filesToPublish.push({
          blob,
          path: PUBLIC_COVER_PATH,
          type: 'artifact',
          mimeType: thumb.mimeType || 'image/jpeg',
        });
    } catch {
      /* no cover this time */
    }
  }

  // Tools are one portable version entity; their internal files are not API Artifacts.
  if (crux.kind === 'tool') {
    const manifest = publishedToolManifest!;
    const existing = filesToPublish.find((file) => file.path === TOOL_PACKAGE_PATH);
    let blob: Blob;
    if (existing) {
      if (filesToPublish.length !== 1)
        throw new Error('An installed tool package cannot be mixed with loose files.');
      await openToolPackage(existing.blob, manifest.id);
      blob = existing.blob;
    } else {
      blob = await packTool(manifest, filesToPublish);
    }
    filesToPublish = [
      {
        path: TOOL_PACKAGE_PATH,
        blob,
        mimeType: 'application/zip',
        type: 'artifact',
        kind: 'tool-package',
      },
    ];
  }

  // 2. Upsert crux to API (create if not exists, update if it does).
  // A transient failure here aborts the publish: `exists` throwing is the
  // guard that stops us taking the destructive create path (see PublishDeps).
  progress('sync');
  assertAuthCurrent(context);
  const cruxExistsOnApi = await deps.api.exists(crux.id);
  assertAuthCurrent(context);
  if (cruxExistsOnApi) {
    await deps.api.update(crux.id, cruxUpsertFields(crux, opts?.messages));
  } else {
    // The API handles slug conflicts by hard-deleting stale records
    await deps.api.create({
      id: crux.id,
      ...cruxUpsertFields(crux, opts?.messages),
      data: isEmbeddedApp(crux) ? '' : crux.data || '',
    });
  }

  // 3. Publish — all files in one multipart request
  progress('upload');
  assertAuthCurrent(context);
  const updated = await deps.api.publish(crux.id, filesToPublish);
  assertAuthCurrent(context);

  // 4. Merge API publish metadata into the local crux (preserving local-only
  // meta) and snapshot fingerprints for change detection; persist locally.
  progress('finalize');
  const publishedFingerprints =
    plan.kind === 'static'
      ? Object.fromEntries(
          plan.files
            .filter(({ file }) => !!file.fingerprint)
            .map(({ file, path }) => [path, file.fingerprint]),
        )
      : buildFingerprintMap(artifacts);
  const mergedMeta = {
    ...(crux.meta as Record<string, unknown>),
    ...(updated.meta as Record<string, unknown>),
    publishedFingerprints,
    messages: crux.meta?.messages,
    settings: crux.meta?.settings,
  };
  await deps.local.updateCruxMeta(crux.id, mergedMeta);
  assertAuthCurrent(context);
  const mergedCrux: Crux = { ...crux, ...updated, meta: mergedMeta as Crux['meta'] };

  // 5. Sync discoverable state and tags (best-effort — publish itself succeeded)
  progress('tags');
  try {
    const tags = crux.discoverable ? (crux.meta?.tags as string[]) || [] : [];
    await deps.api.syncTags(crux.id, tags);
  } catch {
    // best-effort
  }

  assertAuthCurrent(context);
  return mergedCrux;
}

/**
 * Unpublish a crux: removes published files and the API-side record, clears
 * publish metadata locally (persisted — not just in-memory), returns the
 * updated crux.
 */
export async function unpublishPipeline(
  crux: Crux,
  opts?: { deps?: PublishDeps; authContext?: AuthContext },
): Promise<Crux> {
  const context = opts?.authContext ?? captureAuth();
  assertAuthCurrent(context);
  if (crux.type === 'working-copy' || crux.meta?.workingCopy) throw new Error('Publish from Main.');
  if (!opts?.deps) await assertCopyWritable(crux.id);
  const deps = opts?.deps ?? (await defaultDeps(context));

  assertAuthCurrent(context);
  await deps.api.unpublish(crux.id);
  assertAuthCurrent(context);

  const meta = { ...(crux.meta as Record<string, unknown>) };
  delete meta.publishedAt;
  delete meta.publishedVersion;
  delete meta.publishedFingerprints;
  await deps.local.updateCruxMeta(crux.id, meta);
  assertAuthCurrent(context);

  return { ...crux, meta: meta as Crux['meta'], visibility: 'private' };
}
