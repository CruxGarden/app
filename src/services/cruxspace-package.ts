import { generateZip } from '@/lib/zip-off-thread';
import { listGrowths } from './growth';
import { slugify } from '@/lib/slug';
import JSZip from 'jszip';
import type { KeeperConversation } from '@/stores/keeperStore';
import { getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { NotFoundError } from './types';
import { privateArchiveBytes } from './private-crux-archive';
import { exportCrux, importCrux, type ImportMode } from './crux-io';
import {
  collectionsChanged,
  getCruxspace,
  type Cruxspace,
  type CruxspaceOrigin,
  cruxspaceMembers,
} from './cruxspaces';
import { captureGardenId, useGardenContext } from '@/stores/gardenContext';
import { listCruxspaceAssets, type AssetOrigin, type CruxOutput } from './cruxspace-assets';
import { pathOf } from '@/lib/artifact-path';
import { toolManifest, isToolAvailable } from './crux-tools/registry';
import {
  decodeGardenSchedules,
  writeGardenSchedules,
  type GardenSchedules,
} from './garden-schedules';

/**
 * The `.cruxspace` package (ADR 0036 amendment, GAME-CRUXSPACE-PLAN G8): one
 * ZIP that carries a Garden description and every member's complete `.crux`
 * archive, with content bytes shared once under `blobs/<fingerprint>`.
 *
 *   cruxspace.json                 the manifest below
 *   members/<cruxId>/…             a member's archive metadata (manifest and graph)
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
  /**
   * The Crux Tools its members were made with, so the package says what it
   * needs rather than importing into empty workspaces. Absent in packages
   * written before this was recorded — read it through `toolsNeeded`.
   */
  tools?: { id: string; name: string; releaseVersion?: string }[];
  /** The Garden's own schedules (its `meta.gardenSchedules`), so they travel with it. */
  schedules?: GardenSchedules;
}

/**
 * The Crux Tools a package needs. Older packages named none, but every member
 * already carries the template it was made from, which is the same answer.
 */
export function toolsNeeded(
  manifest: PackageManifest,
): { id: string; name: string; releaseVersion?: string }[] {
  if (manifest.tools?.length) return manifest.tools;
  const out = new Map<string, { id: string; name: string; releaseVersion?: string }>();
  for (const member of manifest.members) {
    const tool = member.template ? toolManifest(member.template) : null;
    if (tool)
      out.set(tool.id, { id: tool.id, name: tool.name, releaseVersion: tool.releaseVersion });
  }
  return [...out.values()];
}

/** Of those, the ones this Garden cannot open a member with yet. */
export function missingTools(
  manifest: PackageManifest,
): { id: string; name: string; releaseVersion?: string }[] {
  return toolsNeeded(manifest).filter((tool) => !isToolAvailable(tool.id));
}

export interface ExportCruxspaceOptions {
  spaceId: string;
  /** The member identities shown in the person's export review, when provided. */
  expectedMemberIds?: readonly string[];
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
  const expectedMemberIds = options.expectedMemberIds
    ? new Set(options.expectedMemberIds)
    : undefined;
  archiveService();
  const { space, live } = await cruxspaceMembers(spaceId);
  const memberIds = [...space.cruxIds];
  if (
    expectedMemberIds &&
    (expectedMemberIds.size !== memberIds.length ||
      memberIds.some((id) => !expectedMemberIds.has(id) || !live.has(id)))
  )
    throw new Error('This Garden’s members changed. Review the list before exporting.');
  const { artifact } = getServices();
  const assets = await listCruxspaceAssets(spaceId);
  const zip = new JSZip();
  const blobs = new Set<string>();
  const members: PackageMember[] = [];
  const transfers: PackageTransfer[] = [];
  const unavailable: string[] = [];
  const failed: string[] = [];

  for (const id of memberIds) {
    const member = live.get(id);
    if (!member) {
      unavailable.push(id);
      continue;
    }
    const title = member.title || 'Untitled';
    onProgress?.(`Packing ${title}…`);
    const archive = await exportCrux({
      cruxId: id,
      onProgress,
    });
    failed.push(...archive.failed.map((f) => `${title}: ${f}`));
    const inner = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    const referenced: string[] = [];
    for (const entry of Object.values(inner.files)) {
      if (entry.dir) continue;
      const fp = entry.name.startsWith('content/') ? entry.name.slice('content/'.length) : null;
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

    const growths = await listGrowths(id);
    const files = await artifact.findByResource('crux', id);
    for (const sidecar of files.filter((f) =>
      /^cruxspace-assets\/[a-f0-9]{64}\.json$/.test(pathOf(f)),
    )) {
      if ((sidecar.size ?? 0) > 16000) continue;
      try {
        const origin = JSON.parse(await artifact.readContent(sidecar)) as AssetOrigin;
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

  // The Garden Crux (where there is a Garden graph, the space is one) holds the schedules.
  const gardenCrux = await absentOrFound(() => getServices().crux.findById(spaceId));
  const scheduleDefs = decodeGardenSchedules(gardenCrux?.meta?.gardenSchedules);
  const manifest: PackageManifest = {
    version: 1,
    format: PACKAGE_FORMAT,
    exportedAt: new Date().toISOString(),
    ...(scheduleDefs?.length ? { schedules: { version: 1, schedules: scheduleDefs } } : {}),
    space: {
      id: space.id,
      name: space.name,
      brief: space.brief,
      created: space.created,
      updated: space.updated,
    },
    // Loaded on demand: the Keeper's store pulls the engine and every tool into
    // the module graph, and this service is imported early.
    keeper: await (await import('@/stores/keeperStore')).keeperConversationsFor(space.id),
    members,
    transfers: transfers.sort((a, b) => a.imported.localeCompare(b.imported)),
    unavailable,
    tools: [
      ...new Map(
        members
          .map((m) => (m.template ? toolManifest(m.template) : null))
          .filter((t): t is NonNullable<typeof t> => !!t)
          .map((t) => [t.id, { id: t.id, name: t.name, releaseVersion: t.releaseVersion }]),
      ).values(),
    ],
  };
  zip.file('cruxspace.json', JSON.stringify(manifest, null, 2));
  onProgress?.('Writing the package…');
  const blob = await generateZip(zip, { compression: 'DEFLATE' });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const slug = slugify(space.name, 'cruxspace');
  return { blob, filename: `${slug}-${stamp}.cruxspace`, manifest, failed };
}

export interface ImportCruxspaceOptions {
  data: Blob | ArrayBuffer;
  /** The Garden the package's new Garden grows in (the active one by default). */
  gardenId?: string;
  /** A name for the new Garden, instead of the package's. */
  name?: string;
  /** `restore` keeps the original identities; `clone` makes new ones and records the lineage. */
  mode?: ImportMode;
  onProgress?: (status: string) => void;
}
export interface ImportCruxspaceResult {
  space: Cruxspace;
  members: { id: string; sourceId: string; title: string }[];
  failedArtifacts: string[];
  unavailable: string[];
  /** Crux Tools the package needs that this Garden does not have. */
  missingTools: { id: string; name: string; releaseVersion?: string }[];
}

export async function peekCruxspace(data: Blob | ArrayBuffer): Promise<{
  manifest: PackageManifest;
  /** Member or Cruxspace identities already present in this Garden. */
  conflicts: string[];
  /** Crux Tools the package needs that this Garden does not have. */
  missing: { id: string; name: string; releaseVersion?: string }[];
}> {
  archiveService();
  const zip = await JSZip.loadAsync(data instanceof Blob ? await data.arrayBuffer() : data);
  const manifest = await readManifest(zip);
  const conflicts = await conflictingIdentities(manifest);
  return { manifest, conflicts, missing: missingTools(manifest) };
}

export async function importCruxspace(
  options: ImportCruxspaceOptions,
): Promise<ImportCruxspaceResult> {
  // Intake keeps the chooser's owner and values even if navigation or the
  // caller's options change while the archive is being read.
  options = {
    ...options,
    data: options.data instanceof Blob ? options.data : options.data.slice(0),
  };
  const { data, onProgress } = options;
  const parentId = options.gardenId ?? captureGardenId() ?? useGardenContext.getState().root?.id;
  if (!parentId) throw new Error('Open a Garden to import into.');
  const archiveApi = archiveService();
  const zip = await JSZip.loadAsync(data instanceof Blob ? await data.arrayBuffer() : data);
  const manifest = await readManifest(zip);
  const { crux } = getServices();
  let mode: ImportMode = options.mode ?? 'restore';
  if (mode === 'restore' && (await conflictingIdentities(manifest)).length) mode = 'clone';
  if (mode === 'replace') throw new Error('A Garden package is restored or imported as a copy.');

  // Validate the entire incoming inventory before creating a Garden or a member.
  // The API owns native archive integrity; local cached bytes cannot substitute
  // for a missing incoming file. Do not duplicate graph validation here.
  for (const member of manifest.members) {
    const info = await archiveApi.inspect(
      await privateArchiveBytes(await memberArchive(zip, member)),
    );
    if (info.roots.length !== 1 || info.roots[0] !== member.id || info.includeMembers)
      throw new Error(`The archive root identity does not match ${member.title}.`);
  }

  const name = options.name?.trim() || manifest.space.name;
  const imported: ImportCruxspaceResult['members'] = [];
  const failedArtifacts: string[] = [];
  const ids: Record<string, string> = {};
  const garden = await crux.create({
    ...(mode === 'restore' ? { id: manifest.space.id } : {}),
    title: name,
    description: manifest.space.brief,
    kind: 'garden',
    gardenId: parentId,
  });
  try {
    // Its schedules come back with it; when they next run is this installation's.
    const scheduleDefs = decodeGardenSchedules(manifest.schedules);
    if (scheduleDefs?.length) await writeGardenSchedules(garden.id, scheduleDefs);
    for (const member of manifest.members) {
      onProgress?.(`Restoring ${member.title}…`);
      const archive = await memberArchive(zip, member);
      const result = await importCrux({
        data: archive,
        mode,
        gardenId: garden.id,
      });
      ids[member.id] = result.cruxId;
      imported.push({ id: result.cruxId, sourceId: member.id, title: result.title });
      failedArtifacts.push(...result.failedArtifacts.map((f) => `${member.title}: ${f}`));
    }
    const origin: CruxspaceOrigin | undefined =
      mode === 'clone'
        ? { spaceId: manifest.space.id, exportedAt: manifest.exportedAt, members: ids }
        : undefined;
    if (origin) await crux.update(garden.id, { meta: { cruxspaceOrigin: origin } });
    const space = await getCruxspace(garden.id);
    // The collection's own Collaboration comes back with it.
    if (manifest.keeper?.length)
      await (
        await import('@/stores/keeperStore')
      ).adoptKeeperConversations(manifest.keeper, space.id);
    collectionsChanged();
    return {
      space,
      members: imported,
      failedArtifacts,
      unavailable: manifest.unavailable,
      missingTools: missingTools(manifest),
    };
  } catch (err) {
    const cleanupErrors: unknown[] = [];
    const presence = async (id: string): Promise<'present' | 'absent' | 'unknown'> => {
      try {
        return (await absentOrFound(() => crux.findById(id))) ? 'present' : 'absent';
      } catch (error) {
        cleanupErrors.push(error);
        return 'unknown';
      }
    };
    const remove = async (id: string) => {
      try {
        await crux.delete(id);
      } catch (error) {
        cleanupErrors.push(error);
      }
      return presence(id);
    };
    const remaining: string[] = [];
    let uncertain = false;
    for (const member of imported) {
      const result = await remove(member.id);
      if (result !== 'absent') remaining.push(member.title || 'Untitled Crux');
      if (result === 'unknown') uncertain = true;
    }
    // A refused member cleanup must keep its Garden as a discoverable home.
    // Removing the container first could hide the work that still needs review.
    const gardenState = remaining.length ? await presence(garden.id) : await remove(garden.id);
    collectionsChanged();
    if (remaining.length || gardenState !== 'absent')
      throw new AggregateError(
        [err, ...cleanupErrors],
        `Importing Garden "${name}" failed and cleanup could not finish. ${
          uncertain || gardenState === 'unknown'
            ? 'A partial copy may remain.'
            : 'A partial copy remains.'
        }${
          remaining.length
            ? ` Imported Cruxes ${uncertain ? 'retained or awaiting verification' : 'retained'}: ${remaining.map((title) => `"${title}"`).join(', ')}.`
            : ''
        } Review and remove the partial Garden "${name}" before importing again.`,
        { cause: err },
      );
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
    throw new Error('This package is not a Garden this app understands.');
  if (new Set(manifest.members.map((m) => m.id)).size !== manifest.members.length)
    throw new Error('This package lists a member twice.');
  return manifest;
}

/**
 * Shipped undertaking members may carry their complete native content inline.
 * They need no shared-blob list; newly exported packages deduplicate those bytes.
 */
async function selfContained(zip: JSZip, member: PackageMember): Promise<boolean> {
  const entry = zip.file(`${member.archive}manifest.json`);
  if (!entry || !zip.file(`${member.archive}graph.json`)) return false;
  try {
    const envelope = JSON.parse(await entry.async('text')) as { archiveVersion?: unknown };
    return typeof envelope.archiveVersion === 'number';
  } catch {
    return false;
  }
}

async function memberArchive(zip: JSZip, member: PackageMember): Promise<Blob> {
  const prefix = member.archive;
  const list = zip.file(`${prefix}blobs.json`);
  if (!list && !(await selfContained(zip, member)))
    throw new Error(`The package is missing the file list for ${member.title}.`);
  const fingerprints = (list ? JSON.parse(await list.async('text')) : []) as unknown;
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
  for (const fp of fingerprints as string[]) {
    const blob = zip.file(`blobs/${fp}`);
    if (blob)
      archive.file(`content/${fp}`, blob.async('uint8array'), {
        binary: true,
      });
    else throw new Error(`The package is missing a file that ${member.title} needs.`);
  }
  return generateZip(archive);
}

/** Absence is an expected conflict result; storage refusal is not. */
async function absentOrFound<T>(lookup: () => Promise<T>): Promise<T | null> {
  try {
    return await lookup();
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    return null;
  }
}

/** An occupied root UUID conflicts even when it is trashed or has another kind. */
async function conflictingIdentities(manifest: PackageManifest): Promise<string[]> {
  const { crux } = getServices();
  const conflicts: string[] = [];
  for (const member of manifest.members)
    if (await absentOrFound(() => crux.findById(member.id))) conflicts.push(member.id);
  const root = await absentOrFound(() => crux.findById(manifest.space.id));
  if (root) conflicts.push(manifest.space.id);
  return conflicts;
}

/** Garden packages have one storage owner; unavailable native commands refuse. */
function archiveService() {
  const db = getSqliteClient();
  if (!db.fileContent || !db.privateArchive || !db.gardenMembership)
    throw new Error('The API archive service is unavailable. Restart Garden and retry.');
  return db.privateArchive;
}
