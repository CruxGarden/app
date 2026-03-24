import JSZip from 'jszip';
import { getServices } from './index';
import { guessMimeType, hashContent, buildInsert } from './sqlite/helpers';
import { getSqliteClient } from './sqlite/client';
import { getLocalIdentity } from './sqlite/identity';

// ── Constants ────────────────────────────────────────────

const FORMAT_VERSION = '1.0';
const SUPPORTED_MANIFEST_MAJOR = '1';

// ── Types ───────────────────────────────────────────────

export interface ExportOptions {
  cruxId: string;
  /** Current workspace message segment (overrides meta.messages if provided). */
  messages?: unknown[];
  summary?: unknown;
  author?: { username: string; displayName: string } | null;
  onProgress?: (status: string) => void;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  failed: string[];
}

export interface ArtifactsZipOptions {
  cruxSlug?: string;
  artifacts: { fingerprint?: string; filename: string; meta?: { path?: string; [key: string]: unknown } }[];
  onProgress?: (status: string) => void;
}

export interface ArtifactsZipResult {
  blob: Blob;
  filename: string;
  failed: string[];
}

export type ImportMode = 'restore' | 'replace' | 'clone';

export interface ImportConflictInfo {
  title: string;
  installedVersion: number;
  installedUpdated: string;
  incomingVersion: number;
  incomingUpdated: string;
}

export interface ImportOptions {
  data: Blob | ArrayBuffer;
  mode?: ImportMode;
  onProgress?: (done: number, total: number) => void;
}

export interface ImportResult {
  cruxId: string;
  title: string;
  growthCount: number;
  failedArtifacts: string[];
  layout?: { paneOrder?: string[]; paneVisibility?: Record<string, boolean>; editorTabs?: unknown; folderState?: unknown };
  theme?: { mode?: string; tint?: string };
}

// ── Types: internal ─────────────────────────────────────

interface VersionManifest {
  index: 'current' | number;
  crux: {
    id: string;
    slug: string;
    title: string;
    kind: string;
    meta: Record<string, unknown>;
  };
  artifacts: Record<string, { fingerprint: string; mimeType: string; size: number }>;
  messages: unknown[];
  parentIndex: number | null;
}

interface ExportedDimension {
  sourceIndex: 'current' | number;
  targetIndex: number;
  type: string;
  weight: number;
  meta: Record<string, unknown>;
}

// ── Helpers ─────────────────────────────────────────────

async function toArrayBuffer(data: Blob | ArrayBuffer): Promise<ArrayBuffer> {
  return data instanceof Blob ? data.arrayBuffer() : data;
}

/**
 * Parse a .crux ZIP and return metadata for conflict detection.
 * Does NOT import — just reads crux.json to check if a conflict exists.
 */
export async function peekImport(data: Blob | ArrayBuffer): Promise<{
  cruxData: Record<string, unknown>;
  conflict: ImportConflictInfo | null;
}> {
  const zip = await JSZip.loadAsync(await toArrayBuffer(data));
  const cruxJsonFile = zip.file('crux.json');
  if (!cruxJsonFile) throw new Error('Invalid .crux file: missing crux.json');
  const cruxData = JSON.parse(await cruxJsonFile.async('text'));

  let conflict: ImportConflictInfo | null = null;
  if (cruxData.id) {
    try {
      const { crux: cruxService } = getServices();
      const existing = await cruxService.findById(cruxData.id);
      conflict = {
        title: cruxData.title || 'Imported Crux',
        installedVersion: existing.meta?.growthCount || 0,
        installedUpdated: existing.updated,
        incomingVersion: cruxData.meta?.growthCount || 0,
        incomingUpdated: cruxData.updated || cruxData.meta?.exportedAt || '',
      };
    } catch {
      // No conflict — crux doesn't exist locally
    }
  }

  return { cruxData, conflict };
}

// ── Export ───────────────────────────────────────────────

export async function exportCrux(options: ExportOptions): Promise<ExportResult> {
  const { cruxId, messages, summary = null, author = null, onProgress } = options;
  const { crux: cruxService, artifact, dimension } = getServices();
  const db = getSqliteClient();
  const crux = await cruxService.findById(cruxId);

  const zip = new JSZip();

  onProgress?.('Fetching data...');
  const [freshArtifacts, growths] = await Promise.all([
    artifact.findByResource('crux', cruxId),
    dimension.findBySourceAndType(cruxId, 'growth').catch(() => []),
  ]);
  const sortedGrowths = growths.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));

  onProgress?.('Building version manifests...');

  // Collect fingerprints across all versions
  const allFingerprints = new Set<string>();

  // ── Current version manifest ─────────────────────
  const currentArtifacts: Record<string, { fingerprint: string; mimeType: string; size: number }> = {};
  for (const a of freshArtifacts) {
    const path = (a.meta?.path as string) || a.filename;
    if (a.fingerprint) {
      currentArtifacts[path] = { fingerprint: a.fingerprint, mimeType: a.mimeType, size: Number(a.size) || 0 };
      allFingerprints.add(a.fingerprint);
    }
  }

  const currentSnapshotFingerprint = await artifact.computeSnapshotFingerprint(cruxId);
  // Use provided messages (current segment from store) or fall back to meta.messages
  const currentMessages = messages ?? crux.meta?.messages ?? [];

  // Current version manifest — parentIndex resolved after snapshot loop (needs snapshotIdToIndex)
  const currentManifestBase = {
    index: 'current' as const,
    crux: {
      id: crux.id,
      slug: crux.slug,
      title: crux.title,
      kind: 'workspace',
      meta: { fingerprint: currentSnapshotFingerprint },
    },
    artifacts: currentArtifacts,
    messages: currentMessages,
  };

  // ── Snapshot version manifests ───────────────────
  const failed: string[] = [];
  let exportedVersionCount = 0;
  // Map snapshot crux ID → version index (for parentIndex resolution)
  const snapshotIdToIndex = new Map<string, number>();

  for (let i = 0; i < sortedGrowths.length; i++) {
    const growth = sortedGrowths[i]!;
    onProgress?.(`Processing version ${i + 1}/${sortedGrowths.length}...`);

    try {
      const snapshotCrux = await cruxService.findById(growth.targetId);
      const snapshotArtifacts = await artifact.findByResource('crux', growth.targetId);

      snapshotIdToIndex.set(growth.targetId, i);

      const versionArtifacts: Record<string, { fingerprint: string; mimeType: string; size: number }> = {};
      for (const a of snapshotArtifacts) {
        const path = (a.meta?.path as string) || a.filename;
        if (a.fingerprint) {
          versionArtifacts[path] = { fingerprint: a.fingerprint, mimeType: a.mimeType, size: Number(a.size) || 0 };
          allFingerprints.add(a.fingerprint);
        }
      }

      // Resolve parentIndex from parentCruxId
      const parentCruxId = snapshotCrux.meta?.parentCruxId as string | undefined;
      const parentIndex = parentCruxId ? (snapshotIdToIndex.get(parentCruxId) ?? null) : null;

      // Strip fields that have their own top-level manifest keys to avoid duplication
      const { messages: _msgs, parentCruxId: _pid, ...cleanMeta } = (snapshotCrux.meta ?? {}) as Record<string, unknown>;

      const manifest: VersionManifest = {
        index: i,
        crux: {
          id: snapshotCrux.id,
          slug: snapshotCrux.slug,
          title: snapshotCrux.title ?? '',
          kind: 'snapshot',
          meta: cleanMeta,
        },
        artifacts: versionArtifacts,
        messages: (snapshotCrux.meta?.messages as unknown[]) ?? [],
        parentIndex,
      };
      zip.file(`versions/${i}.json`, JSON.stringify(manifest, null, 2));
      exportedVersionCount++;
    } catch (err) {
      console.warn(`Failed to export version ${i + 1}`, err);
      failed.push(`snapshot ${i + 1}`);
    }
  }

  const growthCount = sortedGrowths.length;

  // ── Write current version manifest (deferred so parentIndex can reference snapshots) ─
  const activeBranch = crux.meta?.settings?.activeBranch as string | undefined;
  const currentParentIndex = activeBranch
    ? (snapshotIdToIndex.get(activeBranch) ?? null)
    : null;
  zip.file('versions/current.json', JSON.stringify({
    ...currentManifestBase,
    parentIndex: currentParentIndex,
  }, null, 2));

  // ── dimensions.json ──────────────────────────────
  const exportedDimensions: ExportedDimension[] = [];
  for (let i = 0; i < sortedGrowths.length; i++) {
    const growth = sortedGrowths[i]!;
    if (!snapshotIdToIndex.has(growth.targetId)) continue; // skip failed snapshots

    // Convert thumbnailId → thumbnailPath for portability
    const meta = { ...(growth.meta || {}) };
    if (meta.thumbnailId) {
      try {
        const thumbArtifact = await artifact.findById(meta.thumbnailId as string);
        meta.thumbnailPath = (thumbArtifact.meta?.path || thumbArtifact.filename) as string;
      } catch {
        // Thumbnail artifact not found — skip
      }
      delete meta.thumbnailId;
    }

    exportedDimensions.push({
      sourceIndex: 'current',
      targetIndex: i,
      type: growth.type,
      weight: growth.weight ?? i + 1,
      meta,
    });
  }
  const dimensionsJsonContent = JSON.stringify(exportedDimensions, null, 2);
  zip.file('dimensions.json', dimensionsJsonContent);

  // ── Download artifact blobs by fingerprint ───────
  const uniqueFingerprints = Array.from(allFingerprints);
  if (uniqueFingerprints.length > 0) {
    onProgress?.('Downloading artifacts...');
    for (let i = 0; i < uniqueFingerprints.length; i++) {
      const fp = uniqueFingerprints[i]!;
      onProgress?.(`${i + 1}/${uniqueFingerprints.length} unique files`);
      try {
        const bytes = await db.blobRead(fp);
        zip.file(`artifacts/${fp}`, bytes);
      } catch (err) {
        console.warn(`Failed to read blob: ${fp}`, err);
        failed.push(fp);
      }
    }
  }

  // ── crux.json ────────────────────────────────────
  const cruxJsonContent = JSON.stringify({
    id: crux.id,
    slug: crux.slug,
    title: crux.title,
    description: crux.description,
    type: crux.type,
    kind: crux.meta?.kind ?? null,
    status: crux.status,
    visibility: crux.visibility,
    authorId: crux.authorId ?? null,
    homeId: crux.homeId ?? null,
    meta: { ...(crux.meta ?? {}), summary, growthCount, messages: undefined },
    created: crux.created,
    updated: crux.updated,
  }, null, 2);
  zip.file('crux.json', cruxJsonContent);

  // ── store.json ──────────────────────────────────
  try {
    const { store } = getServices();
    const entries = await store.list(cruxId);
    if (entries.length > 0) {
      zip.file('store.json', JSON.stringify(
        entries.map((e) => ({ key: e.key, value: e.value, mode: e.mode })),
        null, 2,
      ));
    }
  } catch {
    // Store service may not be ready — skip silently
  }

  // ── Archive integrity fingerprint ────────────────
  const archiveFingerprint = await hashContent(
    [currentSnapshotFingerprint, cruxJsonContent, dimensionsJsonContent].join('\n'),
  );

  // ── manifest.json ────────────────────────────────
  zip.file('manifest.json', JSON.stringify({
    version: FORMAT_VERSION,
    fingerprint: archiveFingerprint,
    exportedAt: new Date().toISOString(),
    artifactCount: uniqueFingerprints.length,
    snapshotCount: exportedVersionCount,
    author,
  }, null, 2));

  onProgress?.('Compressing...');
  const blob = await zip.generateAsync({ type: 'blob' });

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `${crux.slug || 'crux'}-${ts}.crux`;

  return { blob, filename, failed };
}

// ── Artifacts-only ZIP export ────────────────────────────

export async function exportArtifactsZip(options: ArtifactsZipOptions): Promise<ArtifactsZipResult> {
  const { cruxSlug, artifacts, onProgress } = options;
  const db = getSqliteClient();
  const zip = new JSZip();
  const failed: string[] = [];

  for (let i = 0; i < artifacts.length; i++) {
    const a = artifacts[i]!;
    const fp = a.fingerprint;
    if (!fp) continue;

    const path = (a.meta?.path as string) || a.filename || `file-${i + 1}`;
    onProgress?.(`${i + 1}/${artifacts.length} files`);

    try {
      const bytes = await db.blobRead(fp);
      zip.file(path, bytes, { binary: true });
    } catch (err) {
      console.warn(`Failed to read blob: ${fp}`, err);
      failed.push(path);
    }
  }

  onProgress?.('Compressing...');
  const blob = await zip.generateAsync({ type: 'blob' });

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `${cruxSlug || 'crux'}-${ts}.zip`;

  return { blob, filename, failed };
}

// ── Import ──────────────────────────────────────────────

export async function importCrux(options: ImportOptions): Promise<ImportResult> {
  const { data, mode = 'restore', onProgress } = options;
  const zip = await JSZip.loadAsync(await toArrayBuffer(data));
  const { crux: cruxService, artifact: _artifact, dimension: dimService } = getServices();
  const db = getSqliteClient();

  // ── Validate manifest ──────────────────────────────
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid .crux file: missing manifest.json');

  const manifest = JSON.parse(await manifestFile.async('text'));
  const majorVersion = String(manifest.version ?? '').split('.')[0];
  if (majorVersion !== SUPPORTED_MANIFEST_MAJOR) {
    throw new Error(
      `Unsupported .crux format version "${manifest.version}". This app supports v${SUPPORTED_MANIFEST_MAJOR}.x.`,
    );
  }

  // ── Read crux.json ─────────────────────────────────
  const cruxJsonFile = zip.file('crux.json');
  if (!cruxJsonFile) throw new Error('Invalid .crux file: missing crux.json');
  const cruxData = JSON.parse(await cruxJsonFile.async('text'));
  const title = cruxData.title || 'Imported Crux';

  // ── Read dimensions.json ───────────────────────────
  const dimensionsFile = zip.file('dimensions.json');
  const exportedDimensions: ExportedDimension[] = dimensionsFile
    ? JSON.parse(await dimensionsFile.async('text'))
    : [];

  // ── Parse version manifests ────────────────────────
  const versionManifests: VersionManifest[] = [];
  const versionsFolder = zip.folder('versions');
  if (versionsFolder) {
    const versionFiles: JSZip.JSZipObject[] = [];
    versionsFolder.forEach((_relativePath, entry) => {
      if (!entry.dir && _relativePath.endsWith('.json')) {
        versionFiles.push(entry);
      }
    });
    for (const entry of versionFiles) {
      versionManifests.push(JSON.parse(await entry.async('text')));
    }
  }

  const currentVersion = versionManifests.find((v) => v.index === 'current');
  const snapshotVersions = versionManifests
    .filter((v): v is VersionManifest & { index: number } => typeof v.index === 'number')
    .sort((a, b) => a.index - b.index);

  const useOriginalIds = mode !== 'clone';
  const slug = useOriginalIds && cruxData.slug
    ? cruxData.slug
    : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

  // ── Collect unique fingerprints ────────────────────
  const allFingerprints = new Set<string>();
  for (const v of versionManifests) {
    for (const info of Object.values(v.artifacts || {}) as { fingerprint: string }[]) {
      if (info.fingerprint) allFingerprints.add(info.fingerprint);
    }
  }

  // Total progress: 1 (create crux) + fingerprints + snapshots + 1 (final)
  const total = 1 + allFingerprints.size + snapshotVersions.length + 1;
  let done = 0;
  onProgress?.(done, total);

  // ── Safety backup for replace mode ─────────────────
  let replaceBackup: Blob | null = null;
  if (mode === 'replace' && cruxData.id) {
    try {
      await cruxService.findById(cruxData.id);
      const backupResult = await exportCrux({ cruxId: cruxData.id });
      replaceBackup = backupResult.blob;
    } catch {
      // Can't back up — proceed without safety net
    }
  }

  // ── Mutating operations ────────────────────────────
  const createdCruxIds: string[] = [];
  const failedArtifacts: string[] = [];

  try {
    if (mode === 'replace' && cruxData.id) {
      await cruxService.delete(cruxData.id);
    }

    // ── Resolve local identity once ────────────────────
    const identity = await getLocalIdentity();
    const now = new Date().toISOString();

    // Helper: insert an artifact metadata record directly into SQLite.
    // Blobs are already in OPFS — no need to re-read, re-hash, or re-write them.
    // Returns the generated artifact ID (needed for thumbnailPath resolution).
    function insertArtifact(
      resourceId: string,
      path: string,
      info: { fingerprint: string; mimeType: string; size: number },
    ): { id: string; sql: string; params: unknown[] } {
      const mime = info.mimeType || guessMimeType(path);
      const isText = mime.startsWith('text/') || mime === 'application/json'
        || mime === 'application/javascript' || mime === 'application/xml'
        || mime === 'image/svg+xml';
      const record = {
        id: crypto.randomUUID(),
        type: 'artifact',
        kind: 'file',
        path,
        meta: { path },
        resourceId,
        resourceType: 'crux',
        authorId: identity.authorId,
        homeId: identity.homeId,
        encoding: isText ? 'utf-8' : 'binary',
        mimeType: mime,
        filename: path.split('/').pop() || 'unnamed',
        size: info.size,
        fingerprint: info.fingerprint,
        created: now,
        updated: now,
      };
      const { sql, params } = buildInsert('artifacts', record);
      return { id: record.id, sql, params };
    }

    // ── Write all artifact blobs to OPFS first ───────
    for (const fp of allFingerprints) {
      try {
        const entry = zip.file(`artifacts/${fp}`);
        if (entry) {
          const ab = await entry.async('arraybuffer');
          await db.blobWrite(fp, new Uint8Array(ab));
        }
      } catch (err) {
        console.warn(`Failed to write blob: ${fp}`, err);
      }
      done++;
      onProgress?.(done, total);
    }

    // ── Create workspace crux ────────────────────────
    // Messages come from the current version manifest, not a flat file
    const workspaceMessages = currentVersion?.messages ?? [];
    const restoredMeta = { ...(cruxData.meta || {}), messages: workspaceMessages, growthCount: 0 };

    const newCrux = await cruxService.create({
      id: useOriginalIds ? cruxData.id : undefined,
      slug,
      title,
      description: cruxData.description || '',
      type: 'workspace',
      kind: cruxData.kind || undefined,
      meta: restoredMeta,
    });
    createdCruxIds.push(newCrux.id);
    done++;
    onProgress?.(done, total);

    // ── Insert current workspace artifacts (direct SQL) ─
    if (currentVersion) {
      for (const [path, info] of Object.entries(currentVersion.artifacts || {})) {
        const typedInfo = info as { fingerprint: string; mimeType: string; size: number };
        try {
          const { sql, params } = insertArtifact(newCrux.id, path, typedInfo);
          await db.run(sql, params);
        } catch (err) {
          console.warn(`Failed to import artifact: ${path}`, err);
          failedArtifacts.push(path);
        }
      }
    }

    // ── Restore snapshot versions ─────────────────────
    let restoredGrowthCount = 0;
    // Map version index → created snapshot crux ID (for parentIndex resolution)
    const indexToSnapshotId = new Map<number, string>();
    // Map (snapshotCruxId, path) → artifactId for thumbnailPath resolution
    const snapshotArtifactIds = new Map<string, string>();

    for (const sv of snapshotVersions) {
      const svCrux = sv.crux || ({} as Record<string, unknown>);
      try {
        const snapshotId = useOriginalIds && svCrux.id ? svCrux.id : undefined;
        const snapshotSlug = useOriginalIds && svCrux.slug
          ? svCrux.slug
          : `snapshot-${sv.index + 1}-${Date.now().toString(36)}`;

        // Resolve parentIndex → parentCruxId
        const parentCruxId = sv.parentIndex !== null && sv.parentIndex !== undefined
          ? (indexToSnapshotId.get(sv.parentIndex) ?? null)
          : null;

        // Strip messages/parentCruxId from stored meta (they come from top-level manifest fields)
        const { messages: _msgs, parentCruxId: _pid, ...cleanSvMeta } = (svCrux.meta || {}) as Record<string, unknown>;
        const snapshotMeta = { ...cleanSvMeta, messages: sv.messages || [], parentCruxId };

        const snapshotCrux = await cruxService.create({
          id: snapshotId,
          slug: snapshotSlug,
          title: svCrux.title || `Snapshot ${sv.index + 1}`,
          type: 'crux',
          kind: 'snapshot',
          meta: snapshotMeta,
        });
        createdCruxIds.push(snapshotCrux.id);
        indexToSnapshotId.set(sv.index, snapshotCrux.id);

        // Insert snapshot artifacts (direct SQL — no blob I/O)
        for (const [path, info] of Object.entries(sv.artifacts || {})) {
          const typedInfo = info as { fingerprint: string; mimeType: string; size: number };
          try {
            const { id: artId, sql, params } = insertArtifact(snapshotCrux.id, path, typedInfo);
            await db.run(sql, params);
            snapshotArtifactIds.set(`${snapshotCrux.id}:${path.toLowerCase()}`, artId);
          } catch (err) {
            console.warn(`Failed to import snapshot artifact: ${path}`, err);
            failedArtifacts.push(`${svCrux.title || `snapshot ${sv.index + 1}`}: ${path}`);
          }
        }

        // ── Create dimension (with metadata if available) ─
        const exportedDim = exportedDimensions.find((d) => d.targetIndex === sv.index);
        const dimMeta: Record<string, unknown> = exportedDim?.meta ? { ...exportedDim.meta } : {};

        // Resolve thumbnailPath → thumbnailId (using in-memory map, no DB query)
        if (dimMeta.thumbnailPath) {
          const thumbKey = `${snapshotCrux.id}:${(dimMeta.thumbnailPath as string).toLowerCase()}`;
          const thumbId = snapshotArtifactIds.get(thumbKey);
          if (thumbId) {
            dimMeta.thumbnailId = thumbId;
          }
          delete dimMeta.thumbnailPath;
        }

        await dimService.create({
          sourceId: newCrux.id,
          targetId: snapshotCrux.id,
          type: 'growth',
          weight: exportedDim?.weight ?? sv.index + 1,
          meta: Object.keys(dimMeta).length > 0 ? dimMeta : undefined,
        });
        restoredGrowthCount++;
      } catch (err) {
        console.warn(`Failed to import snapshot ${sv.index + 1}`, err);
      }
      done++;
      onProgress?.(done, total);
    }

    // ── Restore store data ──────────────────────────
    const storeFile = zip.file('store.json');
    if (storeFile) {
      try {
        const storeEntries = JSON.parse(await storeFile.async('text')) as {
          key: string;
          value: unknown;
          mode: 'public' | 'protected';
        }[];
        const { store } = getServices();
        for (const entry of storeEntries) {
          await store.set(newCrux.id, entry.key, entry.value, entry.mode);
        }
      } catch (err) {
        console.warn('Failed to restore store data:', err);
      }
    }

    // ── Final meta update ────────────────────────────
    const finalMeta = { ...(cruxData.meta || {}), messages: workspaceMessages, growthCount: restoredGrowthCount };
    // When cloning, preserve the original ID so the lineage is traceable
    if (!useOriginalIds && cruxData.id) {
      finalMeta.sourceId = cruxData.id;
    }
    await cruxService.update(newCrux.id, { meta: finalMeta });
    done++;
    onProgress?.(done, total);

    return {
      cruxId: newCrux.id,
      title,
      growthCount: restoredGrowthCount,
      failedArtifacts,
      layout: cruxData.layout || undefined,
      theme: cruxData.theme || undefined,
    };
  } catch (err) {
    // Rollback: delete any cruxes we created
    for (const id of createdCruxIds) {
      try { await cruxService.delete(id); } catch { /* best-effort */ }
    }

    // Replace mode: restore original from safety backup
    if (replaceBackup) {
      try {
        await importCrux({ data: replaceBackup, mode: 'restore' });
      } catch (restoreErr) {
        console.error('Failed to restore original crux from backup during rollback:', restoreErr);
      }
    }

    throw err;
  }
}
