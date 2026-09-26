import type { MoodPackage } from '@/lib/moods/packages';
import { slugify } from '@/lib/slug';
import { exportMoodPackage, importMoodPackage } from '@/lib/moods/packages';
import { getSqliteClient, type ISqliteClient } from './sqlite/client';
import { getLocalIdentity } from './sqlite/identity';
import { hashContent } from './sqlite/helpers';
import { captureGardenId, useGardenContext } from '@/stores/gardenContext';
import type { FileContentBridge } from '../../electron/src/bridge';

type Head = NonNullable<Awaited<ReturnType<FileContentBridge['head']>>>;
type Reference = { db: ISqliteClient; gardenId: string; id: string; head: Head };
const references = new WeakMap<MoodPackage, Reference & { epoch: object | null }>();
const epochs = new WeakMap<ISqliteClient, object>();
const loads = new WeakMap<ISqliteClient, Map<string, number>>();
function advance(db: ISqliteClient, id: string): number {
  let versions = loads.get(db);
  if (!versions) loads.set(db, (versions = new Map()));
  const version = (versions.get(id) ?? 0) + 1;
  versions.set(id, version);
  return version;
}
const libraries = new WeakMap<ISqliteClient, Map<string, MoodPackage[]>>();
/** A package's own portable ID, before the Crux identity replaces it. */
const portable = new WeakMap<MoodPackage, string>();
/** Built-in Moods a Garden has chosen are kept as quiet backing Cruxes, not library entries. */
const isBuiltIn = async (id: string) =>
  !!(await import('@/lib/moods/bundled-moods')).bundledMood(id);

export function nativeMoodLibrary(): boolean {
  return !!getSqliteClient().fileContent;
}
export function cachedMoodLibrary(): MoodPackage[] {
  const garden = captureGardenId();
  const db = getSqliteClient();
  return garden && epochs.get(db) === useGardenContext.getState().root
    ? (libraries.get(db)?.get(garden) ?? [])
    : [];
}
function remember(db: ISqliteClient, gardenId: string, packages: MoodPackage[]) {
  const root = useGardenContext.getState().root;
  if (root && epochs.get(db) !== root) {
    libraries.delete(db);
    epochs.set(db, root);
  }
  let cache = libraries.get(db);
  if (!cache) libraries.set(db, (cache = new Map()));
  cache.set(gardenId, packages);
}
function context(gardenId = captureGardenId()) {
  const db = getSqliteClient();
  const root = useGardenContext.getState().root;
  if (!gardenId || !root || !db.fileContent || !db.createCrux || !db.gardenMembership)
    throw new Error('Open a Garden before saving or reading Moods.');
  const current = () => {
    if (getSqliteClient() !== db || useGardenContext.getState().root !== root)
      throw new Error('The Garden connection changed. Open Moods again and retry.');
  };
  return { db, gardenId, current, root, content: db.fileContent };
}
async function decode(reference: Reference, bytes: Uint8Array): Promise<MoodPackage> {
  const epoch = useGardenContext.getState().root;
  const pkg = await importMoodPackage(Uint8Array.from(bytes).buffer, async (data) => {
    const fp = await hashContent(data);
    await reference.db.blobWrite(fp, data);
    return fp;
  });
  if (!pkg) throw new Error('This Crux does not contain a complete Mood package.');
  // The API identity is authoritative; an opaque package's portable ID is not a graph reference.
  portable.set(pkg, pkg.id);
  pkg.id = reference.id;
  references.set(pkg, { ...reference, epoch });
  return pkg;
}

/** Reads complete Mood content from this Garden's actual graph and captured heads. */
export async function refreshMoodLibrary(gardenId = captureGardenId()): Promise<MoodPackage[]> {
  const ctx = context(gardenId);
  const version = advance(ctx.db, ctx.gardenId);
  const packages: MoodPackage[] = [];
  let after: string | undefined;
  do {
    const page = await ctx.db.gardenMembership!.list(ctx.gardenId, { limit: 100, after });
    for (const member of page.items) {
      if (member.kind !== 'mood') continue;
      const head = await ctx.content.head(member.id);
      if (!head) throw new Error(`“${member.title}” has no saved Mood content.`);
      const selected = await ctx.content.read({
        cruxId: member.id,
        expected: head,
        path: 'mood.cruxmood',
      });
      if (!selected) throw new Error(`“${member.title}” is missing its Mood package.`);
      const pkg = await decode(
        { db: ctx.db, gardenId: ctx.gardenId, id: member.id, head },
        selected.bytes,
      );
      pkg.name = member.title || pkg.name;
      if (!(await isBuiltIn(portable.get(pkg)!))) packages.push(pkg);
    }
    after = page.next ?? undefined;
  } while (after);
  ctx.current();
  if (loads.get(ctx.db)?.get(ctx.gardenId) === version) remember(ctx.db, ctx.gardenId, packages);
  return libraries.get(ctx.db)?.get(ctx.gardenId) ?? [];
}

/** Save a new private Crux, or explicitly replace the exact package a caller inspected. */
export async function saveMoodCrux(
  pkg: MoodPackage,
  source?: MoodPackage,
  gardenId = captureGardenId(),
  initialId?: string,
): Promise<MoodPackage> {
  const ctx = context(gardenId);
  const reference = source ? references.get(source) : undefined;
  if (source && (!reference || reference.db !== ctx.db || reference.epoch !== ctx.root))
    throw new Error('Open this Mood again before changing it.');
  if (source && pkg.name !== source.name) throw new Error('Save a new Mood to change its name.');
  const captured = structuredClone(pkg);
  const id = reference?.id ?? initialId ?? crypto.randomUUID();
  if (!(await isBuiltIn(captured.id))) captured.id = id;
  const head = reference?.head ?? null;
  const archive = await exportMoodPackage(captured, (fp) => ctx.db.blobRead(fp));
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const fingerprint = await hashContent(bytes);
  const put = {
    id: crypto.randomUUID(),
    path: 'mood.cruxmood',
    fingerprint,
    size: bytes.length,
    mimeType: 'application/zip',
    encoding: 'binary',
    mode: 0o644,
    attributes: {},
  };
  const identity = await getLocalIdentity();
  ctx.current();
  if (reference) {
    const parents = await ctx.db.gardenMembership!.parents(id);
    if (parents.length !== 1 || parents[0]!.id !== reference.gardenId)
      throw new Error('This Mood moved. Open its Garden before changing it.');
    ctx.current();
    await ctx.content.edit({ cruxId: id, expected: head, changes: [{ put, bytes }] });
  } else {
    await ctx.db.createCrux!({
      id,
      gardenId: ctx.gardenId,
      slug: slugify(captured.name, 'mood'),
      title: captured.name,
      kind: 'mood',
      ...identity,
      initialFiles: [{ put, bytes }],
    });
  }
  ctx.current();
  const savedHead = (await ctx.content.head(id))!;
  const selected = await ctx.content.read({
    cruxId: id,
    expected: savedHead,
    path: 'mood.cruxmood',
  });
  if (!selected) throw new Error('The saved Mood content is unavailable.');
  const saved = await decode(
    { db: ctx.db, gardenId: reference?.gardenId ?? ctx.gardenId, id, head: savedHead },
    selected.bytes,
  );
  ctx.current();
  const owner = reference?.gardenId ?? ctx.gardenId;
  const cache = libraries.get(ctx.db)?.get(owner) ?? [];
  advance(ctx.db, owner);
  remember(ctx.db, owner, [...cache.filter((item) => item.id !== id), saved]);
  return saved;
}

export async function trashMoodCrux(id: string): Promise<void> {
  const ctx = context();
  if (!ctx.db.setCruxTrashed) throw new Error('The Mood library is unavailable.');
  // Selection protection lives in the API; a selected Mood cannot silently disappear.
  await ctx.db.setCruxTrashed(id, true);
  ctx.current();
  advance(ctx.db, ctx.gardenId);
  remember(
    ctx.db,
    ctx.gardenId,
    cachedMoodLibrary().filter((pkg) => pkg.id !== id),
  );
}

let retaining: Promise<void> | undefined;
/** One current-profile move, not a second library reader or an old-format converter. */
export function retainCurrentMoodPackages(
  packages: MoodPackage[],
  retire: () => Promise<void>,
): Promise<void> {
  if (retaining) return retaining;
  const captured = structuredClone(packages);
  const root = useGardenContext.getState().root?.id;
  const ctx = context(root);
  retaining = (async () => {
    for (const pkg of captured) {
      const hash = await hashContent(new TextEncoder().encode(JSON.stringify([root, pkg])));
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      ctx.current();
      const existing = await ctx.db.get<{ kind: string }>(
        'SELECT kind FROM cruxes WHERE id = ? AND deleted IS NULL',
        [id],
      );
      if (existing) {
        if (existing.kind !== 'mood') throw new Error('A retained Mood identity is occupied.');
        const head = await ctx.content.head(id);
        if (!head) throw new Error('The retained Mood content is unavailable.');
        const file = await ctx.content.read({ cruxId: id, expected: head, path: 'mood.cruxmood' });
        if (!file) throw new Error('The retained Mood package is unavailable.');
        const retained = await decode({ db: ctx.db, gardenId: ctx.gardenId, id, head }, file.bytes);
        const prepared = await exportMoodPackage(pkg, (fp) => ctx.db.blobRead(fp));
        const expected = await decode(
          { db: ctx.db, gardenId: ctx.gardenId, id, head },
          new Uint8Array(await prepared.arrayBuffer()),
        );
        if (JSON.stringify(retained) !== JSON.stringify(expected))
          throw new Error('The retained Mood changed. The original saved package has been kept.');
      } else await saveMoodCrux(pkg, undefined, ctx.gardenId, id);
    }
    ctx.current();
    await retire();
  })().finally(() => {
    retaining = undefined;
  });
  return retaining;
}

/** Any Mood Crux by identity, wherever it is placed, with its portable package ID. */
export async function readMoodCrux(
  id: string,
): Promise<{ pkg: MoodPackage; portableId: string; revision: number }> {
  const db = getSqliteClient();
  if (!db.fileContent) throw new Error('The Mood library is unavailable.');
  const head = await db.fileContent.head(id);
  if (!head) throw new Error('This Mood has no saved content.');
  const file = await db.fileContent.read({ cruxId: id, expected: head, path: 'mood.cruxmood' });
  if (!file) throw new Error('This Mood is missing its package.');
  const parents = db.gardenMembership ? await db.gardenMembership.parents(id) : [];
  const pkg = await decode({ db, gardenId: parents[0]?.id ?? '', id, head }, file.bytes);
  return { pkg, portableId: portable.get(pkg)!, revision: head.revision };
}

/** The root Garden's backing Crux for a built-in Mood, created once on first choice. */
export async function builtInMoodCrux(pkg: MoodPackage): Promise<string> {
  const ctx = context(useGardenContext.getState().root?.id);
  let after: string | undefined;
  do {
    const page = await ctx.db.gardenMembership!.list(ctx.gardenId, { limit: 100, after });
    for (const member of page.items) {
      if (member.kind !== 'mood') continue;
      const found = await readMoodCrux(member.id).catch(() => null);
      if (found?.portableId === pkg.id) return member.id;
    }
    after = page.next ?? undefined;
  } while (after);
  ctx.current();
  // The app ships the built-in files; the backing Crux only needs to name the Mood.
  const reference = structuredClone(pkg);
  delete reference.bundled;
  return (await saveMoodCrux(reference, undefined, ctx.gardenId)).id;
}

export const hasMoodCruxReference = (pkg: MoodPackage): boolean => references.has(pkg);
