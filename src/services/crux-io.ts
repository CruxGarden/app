import JSZip from 'jszip';
import { getServices } from './index';
import { guessMimeType, hashContent } from './sqlite/helpers';

// ── Constants ────────────────────────────────────────────

const SUPPORTED_MANIFEST_MAJOR = '3';

// ── Types ───────────────────────────────────────────────

export interface ExportOptions {
  cruxId: string;
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

// ── Helpers ─────────────────────────────────────────────

/** Convert Blob to ArrayBuffer for JSZip compatibility in Node environments. */
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
  const { cruxId, messages = [], summary = null, author = null, onProgress } = options;
  const { crux: cruxService, attachment, dimension } = getServices();
  const crux = await cruxService.findById(cruxId);

  const zip = new JSZip();

  onProgress?.('Fetching data...');
  const [freshArtifacts, growths] = await Promise.all([
    attachment.findByResource('crux', cruxId),
    dimension.findBySourceAndType(cruxId, 'growth').catch(() => []),
  ]);
  const sortedGrowths = growths.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));

  onProgress?.('Building version manifests...');

  // Collect fingerprints + build version manifests
  const allFingerprints = new Set<string>();
  const fingerprintToArtifactId = new Map<string, string>();

  // Current version
  const currentArtifacts: Record<string, { fingerprint: string; mimeType: string; size: number }> = {};
  for (const a of freshArtifacts) {
    const path = (a.meta?.path as string) || a.filename;
    if (a.fingerprint) {
      currentArtifacts[path] = { fingerprint: a.fingerprint, mimeType: a.mimeType, size: Number(a.size) || 0 };
      allFingerprints.add(a.fingerprint);
      fingerprintToArtifactId.set(a.fingerprint, a.id);
    }
  }

  const currentSnapshotFingerprint = await attachment.computeSnapshotFingerprint(cruxId);

  zip.file('versions/current.json', JSON.stringify({
    index: 'current',
    crux: { id: crux.id, slug: crux.slug, title: crux.title, kind: 'workspace', meta: { fingerprint: currentSnapshotFingerprint } },
    artifacts: currentArtifacts,
  }, null, 2));

  // Snapshot versions — track actual exported count
  const failed: string[] = [];
  let exportedVersionCount = 0;
  for (let i = 0; i < sortedGrowths.length; i++) {
    const growth = sortedGrowths[i]!;
    onProgress?.(`Processing version ${i + 1}/${sortedGrowths.length}...`);

    try {
      const snapshotCrux = await cruxService.findById(growth.targetId);
      const snapshotArtifacts = await attachment.findByResource('crux', growth.targetId);

      const versionArtifacts: Record<string, { fingerprint: string; mimeType: string; size: number }> = {};
      for (const a of snapshotArtifacts) {
        const path = (a.meta?.path as string) || a.filename;
        if (a.fingerprint) {
          versionArtifacts[path] = { fingerprint: a.fingerprint, mimeType: a.mimeType, size: Number(a.size) || 0 };
          allFingerprints.add(a.fingerprint);
          fingerprintToArtifactId.set(a.fingerprint, a.id);
        }
      }

      zip.file(`versions/${i}.json`, JSON.stringify({
        index: i,
        crux: { id: snapshotCrux.id, slug: snapshotCrux.slug, title: snapshotCrux.title, kind: 'snapshot', meta: snapshotCrux.meta ?? {} },
        artifacts: versionArtifacts,
      }, null, 2));
      exportedVersionCount++;
    } catch (err) {
      console.warn(`Failed to export version ${i + 1}`, err);
      failed.push(`snapshot ${i + 1}`);
    }
  }

  // Derive growthCount from actual fetched data
  const growthCount = sortedGrowths.length;

  // Download artifact blobs by fingerprint
  const uniqueFingerprints = Array.from(allFingerprints);
  if (uniqueFingerprints.length > 0) {
    onProgress?.('Downloading artifacts...');
    for (let i = 0; i < uniqueFingerprints.length; i++) {
      const fp = uniqueFingerprints[i]!;
      const artifactId = fingerprintToArtifactId.get(fp);
      onProgress?.(`${i + 1}/${uniqueFingerprints.length} unique files`);

      if (artifactId) {
        try {
          const blob = await attachment.downloadBlob(artifactId);
          zip.file(`artifacts/${fp}`, await blob.arrayBuffer());
        } catch (err) {
          console.warn(`Failed to download artifact: ${fp}`, err);
          failed.push(fp);
        }
      }
    }
  }

  // crux.json — workspace metadata
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
    meta: { ...(crux.meta ?? {}), summary, growthCount },
    created: crux.created,
    updated: crux.updated,
  }, null, 2);
  zip.file('crux.json', cruxJsonContent);

  // messages.json
  const messagesJsonContent = JSON.stringify(messages, null, 2);
  zip.file('messages.json', messagesJsonContent);

  // Compute archive-level integrity fingerprint covering all JSON + artifact fingerprint
  // This detects tampering with metadata, messages, or version manifests — not just artifacts
  const archiveFingerprint = await hashContent(
    [currentSnapshotFingerprint, cruxJsonContent, messagesJsonContent].join('\n'),
  );

  // manifest.json (v3.0) — uses actual exported counts, not intended counts
  zip.file('manifest.json', JSON.stringify({
    version: '3.0',
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

// ── Import ──────────────────────────────────────────────

export async function importCrux(options: ImportOptions): Promise<ImportResult> {
  const { data, mode = 'restore', onProgress } = options;
  const zip = await JSZip.loadAsync(await toArrayBuffer(data));
  const { crux: cruxService, attachment, dimension: dimService } = getServices();

  // ── Validate manifest ──────────────────────────────
  const manifestFile = zip.file('manifest.json');
  if (manifestFile) {
    const manifest = JSON.parse(await manifestFile.async('text'));
    const majorVersion = String(manifest.version ?? '').split('.')[0];
    if (majorVersion !== SUPPORTED_MANIFEST_MAJOR) {
      throw new Error(
        `Unsupported .crux format version "${manifest.version}". This app supports v${SUPPORTED_MANIFEST_MAJOR}.x.`,
      );
    }
  } else {
    throw new Error('Invalid .crux file: missing manifest.json');
  }

  // ── Read crux.json ─────────────────────────────────
  const cruxJsonFile = zip.file('crux.json');
  if (!cruxJsonFile) throw new Error('Invalid .crux file: missing crux.json');
  const cruxData = JSON.parse(await cruxJsonFile.async('text'));
  const title = cruxData.title || 'Imported Crux';

  // Read messages
  const messagesFile = zip.file('messages.json');
  const messages = messagesFile ? JSON.parse(await messagesFile.async('text')) : [];

  const useOriginalIds = mode !== 'clone';
  const slug = useOriginalIds && cruxData.slug
    ? cruxData.slug
    : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

  // Collect version manifests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versionManifests: { index: number | 'current'; data: any }[] = [];
  const versionsFolder = zip.folder('versions');
  if (versionsFolder) {
    const versionFiles: { name: string; entry: JSZip.JSZipObject }[] = [];
    versionsFolder.forEach((relativePath, entry) => {
      if (!entry.dir && relativePath.endsWith('.json')) {
        versionFiles.push({ name: relativePath, entry });
      }
    });
    for (const { entry } of versionFiles) {
      const parsed = JSON.parse(await entry.async('text'));
      versionManifests.push({ index: parsed.index, data: parsed });
    }
  }

  const currentVersion = versionManifests.find((v) => v.index === 'current');
  const snapshotVersions = versionManifests
    .filter((v) => typeof v.index === 'number')
    .sort((a, b) => (a.index as number) - (b.index as number));

  // Collect unique artifact fingerprints
  const allFingerprints = new Set<string>();
  for (const v of versionManifests) {
    const arts = v.data.artifacts || {};
    for (const info of Object.values(arts) as { fingerprint: string }[]) {
      if (info.fingerprint) allFingerprints.add(info.fingerprint);
    }
  }

  // Total: 1 (create crux) + unique artifacts + snapshot versions + 1 (final update)
  const total = 1 + allFingerprints.size + snapshotVersions.length + 1;
  let done = 0;
  onProgress?.(done, total);

  // ── For replace mode: create a safety backup before deleting ──
  let replaceBackup: Blob | null = null;
  if (mode === 'replace' && cruxData.id) {
    try {
      await cruxService.findById(cruxData.id); // verify it exists before exporting
      const backupResult = await exportCrux({ cruxId: cruxData.id });
      replaceBackup = backupResult.blob;
    } catch {
      // If we can't back up the existing crux (e.g. it was already deleted), proceed without backup
    }
  }

  // ── Mutating operations — track created IDs for rollback ──
  const createdCruxIds: string[] = [];
  const failedArtifacts: string[] = [];

  try {
    // For replace: delete existing (inside try block so rollback can restore from backup)
    if (mode === 'replace' && cruxData.id) {
      await cruxService.delete(cruxData.id);
    }

    // Create workspace crux
    const restoredMeta = { ...(cruxData.meta || {}), messages, growthCount: 0 };
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

    // Load all artifact blobs from artifacts/ directory keyed by fingerprint
    const artifactBlobs = new Map<string, Blob>();
    for (const fp of allFingerprints) {
      try {
        const entry = zip.file(`artifacts/${fp}`);
        if (entry) {
          const ab = await entry.async('arraybuffer');
          artifactBlobs.set(fp, new Blob([ab]));
        }
      } catch (err) {
        console.warn(`Failed to read artifact from ZIP: ${fp}`, err);
      }
      done++;
      onProgress?.(done, total);
    }

    // Upload current workspace artifacts
    if (currentVersion) {
      const arts = currentVersion.data.artifacts || {};
      for (const [path, info] of Object.entries(arts) as [string, { fingerprint: string; mimeType: string; size: number }][]) {
        const blob = artifactBlobs.get(info.fingerprint);
        if (blob) {
          try {
            const filename = path.split('/').pop() || 'file';
            const mime = info.mimeType || guessMimeType(filename);
            const fileObj = new File([blob], filename, { type: mime });
            await attachment.upload({
              resourceId: newCrux.id,
              blob: fileObj,
              mimeType: mime,
              meta: { path },
            });
          } catch (err) {
            console.warn(`Failed to import artifact: ${path}`, err);
            failedArtifacts.push(path);
          }
        }
      }
    }

    // Restore snapshot versions
    let restoredGrowthCount = 0;
    for (const sv of snapshotVersions) {
      const svData = sv.data;
      const svCrux = svData.crux || {};
      try {
        const snapshotId = useOriginalIds && svCrux.id ? svCrux.id : undefined;
        const snapshotSlug = useOriginalIds && svCrux.slug
          ? svCrux.slug
          : `snapshot-${(sv.index as number) + 1}-${Date.now().toString(36)}`;
        const snapshotCrux = await cruxService.create({
          id: snapshotId,
          slug: snapshotSlug,
          title: svCrux.title || `Snapshot ${(sv.index as number) + 1}`,
          type: 'crux',
          kind: 'snapshot',
          meta: svCrux.meta || {},
        });
        createdCruxIds.push(snapshotCrux.id);

        // Upload snapshot artifacts
        const svArts = svData.artifacts || {};
        for (const [path, info] of Object.entries(svArts) as [string, { fingerprint: string; mimeType: string; size: number }][]) {
          const blob = artifactBlobs.get(info.fingerprint);
          if (blob) {
            try {
              const filename = path.split('/').pop() || 'file';
              const mime = info.mimeType || guessMimeType(filename);
              const fileObj = new File([blob], filename, { type: mime });
              await attachment.upload({
                resourceId: snapshotCrux.id,
                blob: fileObj,
                mimeType: mime,
                meta: { path },
              });
            } catch (err) {
              console.warn(`Failed to import snapshot artifact: ${path}`, err);
              failedArtifacts.push(`${svCrux.title || `snapshot ${(sv.index as number) + 1}`}: ${path}`);
            }
          }
        }

        await dimService.create({
          sourceId: newCrux.id,
          targetId: snapshotCrux.id,
          type: 'growth',
          weight: (sv.index as number) + 1,
        });
        restoredGrowthCount++;
      } catch (err) {
        console.warn(`Failed to import snapshot ${(sv.index as number) + 1}`, err);
      }
      done++;
      onProgress?.(done, total);
    }

    // Final meta update with accurate growthCount
    const finalMeta = { ...(cruxData.meta || {}), messages, growthCount: restoredGrowthCount };
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
    // Rollback: delete any cruxes we created (cascade deletes their artifacts + dimensions)
    for (const id of createdCruxIds) {
      try {
        await cruxService.delete(id);
      } catch {
        // Best-effort cleanup
      }
    }

    // For replace mode: restore the original crux from the safety backup
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
