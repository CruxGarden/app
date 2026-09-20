import JSZip from 'jszip';
import type { KeeperConversation } from '@/stores/keeperStore';
import { getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { exportCrux, importCrux, type ImportMode } from './crux-io';
import { getCruxspace, insertCruxspace, type Cruxspace, type CruxspaceOrigin } from './cruxspaces';
import { listCruxspaceAssets, type AssetOrigin, type CruxOutput } from './cruxspace-assets';
import { pathOf } from '@/lib/artifact-path';

/**
 * The `.cruxspace` package (ADR 0036 amendment, GAME-CRUXSPACE-PLAN G8): one
 * ZIP that carries a Cruxspace record and every member's complete `.crux`
 * archive, with the Artifact blobs shared once under `blobs/<fingerprint>`.
 *
 *   cruxspace.json                 the manifest below
 *   members/<cruxId>/…             a member's `.crux` entries minus `artifacts/`
 *   members/<cruxId>/blobs.json    the fingerprints that archive references
 *   blobs/<fingerprint>            deduplicated Artifact bytes
 *
 * Import rebuilds each member archive from those parts and hands it to the
 * ordinary `.crux` importer, so every rule about installation-only metadata,
 * Growth, Tasks and Project Folders stays in one place.
 */
export const PACKAGE_FORMAT = 'cruxspace/1.0';
const MAX_MEMBERS = 100;

export interface PackageMember {
  id: string;
  title: string;
  slug: string;
  /** The Template Crux or app the member was made from, when recorded. */
  template: string | null;
  archive: string;
  /** Checkpoint labels on the member's Main lane, oldest first. */
  checkpoints: { index: number; label: string | null; created: string }[];
  outputs: CruxOutput[];
}
export interface PackageTransfer extends AssetOrigin {
  /** The member that used the output. */
  targetCruxId: string;
}
export interface PackageManifest {
  version: 1;
  format: typeof PACKAGE_FORMAT;
  exportedAt: string;
  space: Pick<Cruxspace, 'id' | 'name' | 'brief' | 'created' | 'updated'>;
  members: PackageMember[];
  transfers: PackageTransfer[];
  /** Member ids the exporting Garden no longer had. */
  unavailable: string[];
  /** The Keeper conversations that built or tended this Cruxspace (garden-level history). */
  keeper?: KeeperConversation[];
}

export interface ExportCruxspaceOptions {
  spaceId: string;
  onProgress?: (status: string) => void;
}
export interface ExportCruxspaceResult {
  blob: Blob;
  filename: string;
  manifest: PackageManifest;
  /** Snapshots or files a member archive could not include. */
  failed: string[];
}

export async function exportCruxspace(
  options: ExportCruxspaceOptions,
): Promise<ExportCruxspaceResult> {
  const { spaceId, onProgress } = options;
  const space = await getCruxspace(spaceId);
  const { crux, artifact, dimension } = getServices();
  const live = new Map((await crux.listAll()).map((c) => [c.id, c]));
  const assets = await listCruxspaceAssets(spaceId);
  const zip = new JSZip();
  const blobs = new Set<string>();
  const members: PackageMember[] = [];
  const transfers: PackageTransfer[] = [];
  const unavailable: string[] = [];
  const failed: string[] = [];

  for (const id of space.cruxIds) {
    const member = live.get(id);
    if (!member) {
      unavailable.push(id);
      continue;
    }
    const title = member.title || 'Untitled';
    onProgress?.(`Packing ${title}…`);
    const archive = await exportCrux({ cruxId: id, onProgress });
    failed.push(...archive.failed.map((f) => `${title}: ${f}`));
    const inner = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    const referenced: string[] = [];
    for (const entry of Object.values(inner.files)) {
      if (entry.dir) continue;
      const fp = entry.name.startsWith('artifacts/') ? entry.name.slice('artifacts/'.length) : null;
      if (fp) {
        if (!/^[a-f0-9]{64}$/.test(fp))
          throw new Error('A member archive holds an invalid Fingerprint.');
        referenced.push(fp);
        if (!blobs.has(fp)) {
          blobs.add(fp);
          // JSZip reads a promised entry only while generating, so members are
          // never held in memory twice.
          zip.file(`blobs/${fp}`, entry.async('uint8array'), { binary: true });
        }
      } else {
        zip.file(`members/${id}/${entry.name}`, entry.async('uint8array'), { binary: true });
      }
    }
    zip.file(`members/${id}/blobs.json`, JSON.stringify(referenced));

    const growths = (await dimension.findBySourceAndType(id, 'growth').catch(() => [])).sort(
      (a, b) => (a.weight ?? 0) - (b.weight ?? 0),
    );
    const files = await artifact.findByResource('crux', id);
    for (const sidecar of files.filter((f) =>
      /^cruxspace-assets\/[a-f0-9]{64}\.json$/.test(pathOf(f)),
    )) {
      if ((sidecar.size ?? 0) > 16000) continue;
      try {
        const origin = JSON.parse(await artifact.readContent(sidecar.id)) as AssetOrigin;
        if (origin?.version === 1 && origin.spaceId === spaceId)
          transfers.push({ ...origin, targetCruxId: id });
      } catch {
        // an unreadable sidecar is not part of the story
      }
    }
    members.push({
      id,
      title,
      slug: member.slug,
      template: typeof member.meta?.template === 'string' ? member.meta.template : null,
      archive: `members/${id}/`,
      checkpoints: growths.map((g, index) => ({
        index,
        label: typeof g.meta?.label === 'string' && g.meta.label ? g.meta.label : null,
        created: g.created,
      })),
      outputs: assets
        .filter((a) => a.sourceCruxId === id)
        .map(({ sourceCruxId: _s, sourceTitle: _t, ...output }) => output),
    });
  }

  const manifest: PackageManifest = {
    version: 1,
    format: PACKAGE_FORMAT,
    exportedAt: new Date().toISOString(),
    space: {
      id: space.id,
      name: space.name,
      brief: space.brief,
      created: space.created,
      updated: space.updated,
    },
    // Loaded on demand: the Keeper's store pulls the engine and every tool into
    // the module graph, and this service is imported early.
    keeper: (await import('@/stores/keeperStore')).keeperConversationsFor(space.id),
    members,
    transfers: transfers.sort((a, b) => a.imported.localeCompare(b.imported)),
    unavailable,
  };
  zip.file('cruxspace.json', JSON.stringify(manifest, null, 2));
  onProgress?.('Writing the package…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const slug =
    space.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cruxspace';
  return { blob, filename: `${slug}-${stamp}.cruxspace`, manifest, failed };
}

export interface ImportCruxspaceOptions {
  data: Blob | ArrayBuffer;
  /** `restore` keeps the original identities; `clone` makes new ones and records the lineage. */
  mode?: ImportMode;
  onProgress?: (status: string) => void;
}
export interface ImportCruxspaceResult {
  space: Cruxspace;
  members: { id: string; sourceId: string; title: string }[];
  failedArtifacts: string[];
  unavailable: string[];
}

export async function peekCruxspace(data: Blob | ArrayBuffer): Promise<{
  manifest: PackageManifest;
  /** Member or Cruxspace identities already present in this Garden. */
  conflicts: string[];
}> {
  const zip = await JSZip.loadAsync(data instanceof Blob ? await data.arrayBuffer() : data);
  const manifest = await readManifest(zip);
  const { crux } = getServices();
  const conflicts: string[] = [];
  for (const member of manifest.members) {
    const existing = await crux.findById(member.id).catch(() => null);
    if (existing) conflicts.push(member.id);
  }
  if (await getCruxspace(manifest.space.id).catch(() => null)) conflicts.push(manifest.space.id);
  return { manifest, conflicts };
}

export async function importCruxspace(
  options: ImportCruxspaceOptions,
): Promise<ImportCruxspaceResult> {
  const { data, onProgress } = options;
  const zip = await JSZip.loadAsync(data instanceof Blob ? await data.arrayBuffer() : data);
  const manifest = await readManifest(zip);
  const { crux } = getServices();
  let mode: ImportMode = options.mode ?? 'restore';
  if (mode === 'restore') {
    for (const member of manifest.members)
      if (await crux.findById(member.id).catch(() => null)) mode = 'clone';
    if (await getCruxspace(manifest.space.id).catch(() => null)) mode = 'clone';
  }
  if (mode === 'replace') throw new Error('A Cruxspace package is restored or imported as a copy.');

  const imported: ImportCruxspaceResult['members'] = [];
  const failedArtifacts: string[] = [];
  const ids: Record<string, string> = {};
  try {
    for (const member of manifest.members) {
      onProgress?.(`Restoring ${member.title}…`);
      const archive = await memberArchive(zip, member);
      const result = await importCrux({ data: archive, mode });
      ids[member.id] = result.cruxId;
      imported.push({ id: result.cruxId, sourceId: member.id, title: result.title });
      failedArtifacts.push(...result.failedArtifacts.map((f) => `${member.title}: ${f}`));
    }
    onProgress?.('Recording the Cruxspace…');
    const origin: CruxspaceOrigin | undefined =
      mode === 'clone'
        ? { spaceId: manifest.space.id, exportedAt: manifest.exportedAt, members: ids }
        : undefined;
    const space = await insertCruxspace({
      id: mode === 'clone' ? crypto.randomUUID() : manifest.space.id,
      name: manifest.space.name,
      brief: manifest.space.brief,
      cruxIds: imported.map((m) => m.id),
      created: manifest.space.created,
      origin,
    });
    // The garden-level history comes back with it, retagged to the space it now is.
    if (manifest.keeper?.length)
      (await import('@/stores/keeperStore')).adoptKeeperConversations(manifest.keeper, space.id);
    return { space, members: imported, failedArtifacts, unavailable: manifest.unavailable };
  } catch (err) {
    for (const member of imported) await crux.delete(member.id).catch(() => undefined);
    throw err;
  }
}

async function readManifest(zip: JSZip): Promise<PackageManifest> {
  const file = zip.file('cruxspace.json');
  if (!file) throw new Error('Choose a .cruxspace package: cruxspace.json is missing.');
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(await file.async('text'));
  } catch {
    throw new Error('This package manifest is not valid JSON.');
  }
  if (
    manifest?.version !== 1 ||
    manifest.format !== PACKAGE_FORMAT ||
    typeof manifest.space?.id !== 'string' ||
    !/^[\w-]{1,80}$/.test(manifest.space.id) ||
    typeof manifest.space.name !== 'string' ||
    !manifest.space.name.trim() ||
    manifest.space.name.length > 120 ||
    typeof manifest.space.brief !== 'string' ||
    manifest.space.brief.length > 8000 ||
    !Array.isArray(manifest.members) ||
    manifest.members.length > MAX_MEMBERS ||
    manifest.members.some(
      (m) =>
        typeof m?.id !== 'string' ||
        !/^[\w-]{1,80}$/.test(m.id) ||
        typeof m.title !== 'string' ||
        m.archive !== `members/${m.id}/`,
    ) ||
    !Array.isArray(manifest.unavailable)
  )
    throw new Error('This package is not a Cruxspace this app understands.');
  if (new Set(manifest.members.map((m) => m.id)).size !== manifest.members.length)
    throw new Error('This package lists a member twice.');
  return manifest;
}

/** Rebuild one member's `.crux` archive from its entries and the shared blobs. */
async function memberArchive(zip: JSZip, member: PackageMember): Promise<Blob> {
  const prefix = member.archive;
  const list = zip.file(`${prefix}blobs.json`);
  if (!list) throw new Error(`The package is missing the file list for ${member.title}.`);
  const fingerprints = JSON.parse(await list.async('text')) as unknown;
  if (
    !Array.isArray(fingerprints) ||
    fingerprints.some((fp) => typeof fp !== 'string' || !/^[a-f0-9]{64}$/.test(fp))
  )
    throw new Error(`The file list for ${member.title} is invalid.`);
  const archive = new JSZip();
  let entries = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith(prefix) || entry.name === `${prefix}blobs.json`)
      continue;
    archive.file(entry.name.slice(prefix.length), entry.async('uint8array'), { binary: true });
    entries++;
  }
  if (!entries) throw new Error(`The package holds no archive for ${member.title}.`);
  const db = getSqliteClient();
  for (const fp of fingerprints as string[]) {
    const blob = zip.file(`blobs/${fp}`);
    if (blob) archive.file(`artifacts/${fp}`, blob.async('uint8array'), { binary: true });
    else if (!(await db.blobExists(fp)))
      throw new Error(`The package is missing a file that ${member.title} needs.`);
  }
  return archive.generateAsync({ type: 'blob' });
}
