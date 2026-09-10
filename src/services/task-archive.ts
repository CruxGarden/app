/** Version 2 preserves the complete private task graph, not just Main's first-parent history. */
import JSZip from 'jszip';
import type { ExportOptions, ExportResult, ImportOptions, ImportResult } from './crux-io';
import { getSqliteClient } from './sqlite/client';
import { buildInsert, hashContent } from './sqlite/helpers';
import { getLocalIdentity } from './sqlite/identity';
import { getServices } from './index';
import { createProjectFolder, projectAllArtifacts } from './project-folder';
import { syncAgentsMd } from './agents-md';
import { announceTasksChanged } from './working-copies';

type Row = Record<string, unknown> & { id: string };
interface TaskArchive {
  cruxId: string;
  cruxes: Row[];
  copies: Row[];
  artifacts: Row[];
  dimensions: Row[];
  store: Row[];
}
export function portableMeta(raw: unknown): Record<string, unknown> {
  const meta = { ...(typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {})) };
  for (const key of [
    'projectFolder',
    'publishedAt',
    'publishedVersion',
    'publishedFingerprints',
    'turnJob',
    'turnQueue',
    'agentHost',
  ])
    delete meta[key];
  if (meta.settings) {
    meta.settings = { ...meta.settings };
    delete meta.settings.agentSessionId;
    delete meta.settings.agentHost;
  }
  return meta;
}
function remapMeta(raw: unknown, ids: Map<string, string>) {
  const meta = portableMeta(raw);
  const replace = (obj: Record<string, unknown>, keys: string[]) => {
    for (const k of keys)
      if (typeof obj[k] === 'string' && ids.has(obj[k])) obj[k] = ids.get(obj[k]);
  };
  replace(meta, ['parentCruxId', 'contentOwnerId']);
  if (Array.isArray(meta.messages))
    meta.messages = meta.messages.map((message) => {
      const next = { ...message };
      replace(next, ['taskMergeId']);
      return next;
    });
  for (const [key, fields] of Object.entries({
    settings: ['activeBranch'],
    workingCopy: ['cruxId', 'taskId', 'baseSnapshotId'],
    merge: ['id', 'taskId', 'copyId', 'baseId', 'sourceHead', 'targetHead'],
  })) {
    if (meta[key] && typeof meta[key] === 'object') {
      meta[key] = { ...(meta[key] as Record<string, unknown>) };
      replace(meta[key] as Record<string, unknown>, fields);
    }
  }
  return meta;
}
export async function exportTaskCrux(options: ExportOptions): Promise<ExportResult> {
  if (
    await getSqliteClient().get(
      "SELECT id FROM task_merges WHERE crux_id = ? AND phase = 'applying'",
      [options.cruxId],
    )
  )
    throw new Error('Recover the pending merge before exporting this Crux.');
  const { withCapturedTaskGraph } = await import('./tasks');
  return withCapturedTaskGraph(options.cruxId, () => packTaskCrux(options));
}
async function packTaskCrux(options: ExportOptions): Promise<ExportResult> {
  const db = getSqliteClient();
  const { cruxId } = options;
  if (await db.get("SELECT id FROM task_merges WHERE crux_id = ? AND phase = 'applying'", [cruxId]))
    throw new Error('Recover the pending merge before exporting this Crux.');
  const owner = await db.get<Row>('SELECT * FROM cruxes WHERE id = ?', [cruxId]);
  if (!owner) throw new Error('Export from Main.');
  const copies = await db.all<Row>(
    "SELECT * FROM working_copies WHERE crux_id = ? AND role = 'task'",
    [cruxId],
  );
  const owners = [cruxId, ...copies.map((c) => c.id)];
  const dimensions: Row[] = [];
  const cruxes = [owner];
  for (const id of owners) {
    const dims = await db.all<Row>(
      "SELECT * FROM dimensions WHERE source_id = ? AND type = 'growth'",
      [id],
    );
    dimensions.push(...dims);
    for (const dim of dims) {
      const node = await db.get<Row>('SELECT * FROM cruxes WHERE id = ?', [dim.target_id]);
      if (!node)
        throw new Error('A Growth snapshot is missing. Export stopped to avoid losing history.');
      cruxes.push(node);
    }
  }
  const artifacts: Row[] = [];
  for (const id of [...new Set([...owners, ...cruxes.map((c) => c.id)])])
    artifacts.push(...(await db.all<Row>('SELECT * FROM artifacts WHERE resource_id = ?', [id])));
  const store: Row[] = [];
  for (const id of owners)
    store.push(...(await db.all<Row>('SELECT * FROM store WHERE crux_id = ?', [id])));
  const archive: TaskArchive = {
    cruxId,
    cruxes: cruxes.map((c) => ({ ...c, meta: portableMeta(c.meta) })),
    copies: copies.map((c) => ({ ...c, project_folder: null, meta: portableMeta(c.meta) })),
    artifacts,
    dimensions,
    store,
  };
  if (options.messages)
    (archive.cruxes[0]!.meta as Record<string, unknown>).messages = options.messages;
  const payload = JSON.stringify(archive);
  const zip = new JSZip();
  zip.file('tasks.json', payload);
  zip.file('crux.json', JSON.stringify({ ...owner, meta: portableMeta(owner.meta) }));
  const fingerprints = new Set(
    artifacts.map((a) => String(a.fingerprint)).filter((fp) => fp !== 'null'),
  );
  // Portraits may be referenced by metadata without an Artifact row.
  for (const c of archive.cruxes) {
    const text = JSON.stringify(c.meta);
    for (const match of text.matchAll(
      /"(?:thumbnailFingerprint|thumbnailFingerprintLight|avatarFingerprint)":"([a-f0-9]{64})"/g,
    ))
      fingerprints.add(match[1]!);
  }
  for (const fp of fingerprints) {
    options.onProgress?.('Packing task Artifacts and Growth…');
    const bytes = await db.blobRead(fp); // fail closed: this is a backup, never silently partial
    if ((await hashContent(bytes)) !== fp)
      throw new Error('An Artifact failed its integrity check.');
    zip.file(`artifacts/${fp}`, bytes);
  }
  zip.file(
    'manifest.json',
    JSON.stringify({
      version: '2.0',
      fingerprint: await hashContent(payload),
      exportedAt: new Date().toISOString(),
      artifactCount: fingerprints.size,
      snapshotCount: cruxes.length - 1,
      author: options.author ?? null,
    }),
  );
  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    filename: `${owner.slug}-${Date.now()}.crux`,
    failed: [],
  };
}
function validateArchive(archive: TaskArchive) {
  if (
    !archive.cruxId ||
    ![archive.cruxes, archive.copies, archive.artifacts, archive.dimensions, archive.store].every(
      Array.isArray,
    )
  )
    throw new Error('Invalid task archive.');
  const cruxIds = new Set(archive.cruxes.map((r) => r.id));
  const copyIds = new Set(archive.copies.map((r) => r.id));
  if (!cruxIds.has(archive.cruxId)) throw new Error('Archive is missing Main.');
  const all = [
    ...archive.cruxes,
    ...archive.copies,
    ...archive.artifacts,
    ...archive.dimensions,
    ...archive.store,
  ];
  if (
    all.some((r) => typeof r.id !== 'string') ||
    new Set(all.map((r) => r.id)).size !== all.length
  )
    throw new Error('Duplicate archive identity.');
  for (const c of archive.copies)
    if (
      c.crux_id !== archive.cruxId ||
      c.role !== 'task' ||
      !cruxIds.has(String(c.base_snapshot_id))
    )
      throw new Error('Invalid task owner or base.');
  for (const d of archive.dimensions)
    if (
      !cruxIds.has(String(d.target_id)) ||
      !(d.source_id === archive.cruxId || copyIds.has(String(d.source_id)))
    )
      throw new Error('Invalid Growth ownership.');
  const owners = new Set([...cruxIds, ...copyIds]);
  for (const row of [...archive.cruxes, ...archive.copies]) {
    const meta = portableMeta(row.meta);
    const settings = meta.settings as { activeBranch?: string } | undefined;
    const merge = meta.merge as
      | { sourceHead?: string; targetHead?: string; baseId?: string; copyId?: string }
      | undefined;
    for (const ref of [
      meta.parentCruxId,
      settings?.activeBranch,
      merge?.sourceHead,
      merge?.targetHead,
      merge?.baseId,
    ]) {
      if (ref && !cruxIds.has(String(ref)))
        throw new Error('Archive has a missing Growth ancestor.');
    }
    if (merge?.copyId && !copyIds.has(merge.copyId))
      throw new Error('Archive has a missing merged task.');
  }
  for (const a of archive.artifacts) {
    const path = String(a.path);
    if (
      !owners.has(String(a.resource_id)) ||
      !/^[a-f0-9]{64}$/.test(String(a.fingerprint)) ||
      !path ||
      path.includes('\\') ||
      path.includes(':') ||
      path.includes('\0') ||
      path.split('/').some((p) => !p || p === '.' || p === '..')
    )
      throw new Error('Invalid task Artifact.');
  }
  for (const entry of archive.store)
    if (!(entry.crux_id === archive.cruxId || copyIds.has(String(entry.crux_id))))
      throw new Error('Invalid local Store owner.');
}
export async function importTaskCrux(zip: JSZip, options: ImportOptions): Promise<ImportResult> {
  const file = zip.file('tasks.json');
  if (!file) throw new Error('Invalid v2 archive: missing tasks.json.');
  const payload = await file.async('text');
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
  if ((await hashContent(payload)) !== manifest.fingerprint)
    throw new Error('Task archive integrity check failed.');
  const archive = JSON.parse(payload) as TaskArchive;
  validateArchive(archive);
  const db = getSqliteClient();
  const clone = options.mode === 'clone';
  const ids = new Map<string, string>();
  for (const rows of [
    archive.cruxes,
    archive.copies,
    archive.artifacts,
    archive.dimensions,
    archive.store,
  ]) {
    for (const row of rows) ids.set(row.id, clone ? crypto.randomUUID() : row.id);
  }
  for (const c of archive.copies)
    ids.set(String(c.task_id), clone ? crypto.randomUUID() : String(c.task_id));
  for (const c of archive.cruxes) {
    const merge = portableMeta(c.meta).merge as { id?: string } | undefined;
    if (merge?.id) ids.set(merge.id, clone ? crypto.randomUUID() : merge.id);
  }
  // Validate every blob before altering any metadata or folder.
  const blobs = new Map<string, Uint8Array>();
  for (const a of archive.artifacts) {
    const fp = String(a.fingerprint);
    if (blobs.has(fp)) continue;
    const entry = zip.file(`artifacts/${fp}`);
    if (!entry) throw new Error('Task archive is missing an Artifact.');
    const bytes = await entry.async('uint8array');
    if ((await hashContent(bytes)) !== fp) throw new Error('Task Artifact integrity check failed.');
    blobs.set(fp, bytes);
  }
  for (const entry of Object.values(zip.files)) {
    const fp = entry.name.replace(/^artifacts\//, '');
    if (entry.dir || !entry.name.startsWith('artifacts/') || blobs.has(fp)) continue;
    if (!/^[a-f0-9]{64}$/.test(fp)) throw new Error('Invalid archived Fingerprint.');
    const bytes = await entry.async('uint8array');
    if ((await hashContent(bytes)) !== fp) throw new Error('Task Artifact integrity check failed.');
    blobs.set(fp, bytes);
  }
  const existing = await db.get('SELECT id FROM cruxes WHERE id = ?', [ids.get(archive.cruxId)]);
  if (existing) {
    // Replacing an open graph is unsafe; clone remains available and lossless.
    throw new Error('This Crux already exists. Import as a new Crux to keep both sets of tasks.');
  }
  for (const [fp, bytes] of blobs) await db.blobWrite(fp, bytes);
  const identity = await getLocalIdentity();
  const inserted: { table: string; id: string }[] = [];
  const tables = [
    ['cruxes', archive.cruxes],
    ['working_copies', archive.copies],
    ['artifacts', archive.artifacts],
    ['dimensions', archive.dimensions],
    ['store', archive.store],
  ] as const;
  try {
    for (const [table, rows] of tables) {
      const columns = new Set(
        (await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name),
      );
      for (const row of rows) {
        const next: Record<string, unknown> = Object.fromEntries(
          Object.entries(row).filter(([k]) => columns.has(k)),
        );
        next.id = ids.get(row.id)!;
        for (const k of [
          'crux_id',
          'task_id',
          'base_snapshot_id',
          'resource_id',
          'source_id',
          'target_id',
        ])
          if (typeof next[k] === 'string') next[k] = ids.get(next[k]) ?? next[k];
        if ('meta' in next) {
          next.meta = remapMeta(next.meta, ids);
          if (table === 'dimensions') {
            const meta = next.meta as Record<string, unknown>;
            if (typeof meta.thumbnailId === 'string') meta.thumbnailId = ids.get(meta.thumbnailId);
          }
        }
        if ('author_id' in next) next.author_id = identity.authorId;
        if ('home_id' in next) next.home_id = identity.homeId;
        if (table === 'cruxes') {
          next.deleted = null;
          next.remote_id = null;
          next.synced_at = null;
          next.visibility = 'private';
          next.discoverable = 0;
          if (clone) next.slug = `${row.slug}-${String(next.id).slice(0, 8)}`;
        }
        if (table === 'working_copies') next.project_folder = null;
        const insert = buildInsert(table, next);
        await db.run(insert.sql, insert.params);
        inserted.push({ table, id: String(next.id) });
      }
    }
    const cruxId = ids.get(archive.cruxId)!;
    for (const id of [cruxId, ...archive.copies.map((c) => ids.get(c.id)!)]) {
      const folder = await createProjectFolder(
        id === cruxId
          ? String(archive.cruxes.find((c) => c.id === archive.cruxId)!.slug)
          : `task-${id}`,
      );
      if (id === cruxId)
        await getServices().crux.update(id, { meta: { projectFolder: folder ?? undefined } });
      else await db.run('UPDATE working_copies SET project_folder = ? WHERE id = ?', [folder, id]);
      await projectAllArtifacts(id);
      await syncAgentsMd(await getServices().crux.findById(id), null);
    }
    announceTasksChanged();
    const owner = await getServices().crux.findById(cruxId);
    return {
      cruxId,
      title: owner.title ?? 'Imported Crux',
      growthCount: archive.dimensions.filter((d) => d.source_id === archive.cruxId).length,
      failedArtifacts: [],
    };
  } catch (error) {
    for (const row of inserted.reverse())
      await db.run(`DELETE FROM ${row.table} WHERE id = ?`, [row.id]);
    throw error;
  }
}
