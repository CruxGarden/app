import { getSqliteClient } from './sqlite/client';
import { getServices } from './index';
import { gardenMembers } from './garden-navigation';
import { captureGardenId, useGardenContext } from '@/stores/gardenContext';

/**
 * A collection is a Garden (ADR 0049, ADR 0058): its name and brief are the
 * Garden Crux's title and description, its Cruxes are the Garden's creative
 * members. Where the connection owns a Garden graph (desktop) this module is
 * a view of it and keeps no record of its own; Web Mode, which has no graph,
 * keeps its collections as settings records below.
 */
export interface Cruxspace {
  version: 1;
  id: string;
  name: string;
  brief: string;
  cruxIds: string[];
  created: string;
  updated: string;
  /** Set when the Garden came in as a copy from a `.cruxspace` package. */
  origin?: CruxspaceOrigin;
}
export interface CruxspaceOrigin {
  spaceId: string;
  exportedAt: string;
  /** Original member id → the id it received here. */
  members: Record<string, string>;
}
export type CruxspaceInput = Pick<Cruxspace, 'name' | 'brief' | 'cruxIds'>;
const PREFIX = 'cruxgarden:cruxspace:';
/** Desktop connections own a Garden graph; elsewhere collections stay settings records. */
const graph = () => !!getSqliteClient().gardenMembership;
export const CRUXSPACES_CHANGED = 'cruxspaces:changed';
export function collectionsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CRUXSPACES_CHANGED));
}

/** The Cruxes a Garden holds for work: not child Gardens, Moods or versions. */
const works = (kind?: string | null) => kind !== 'garden' && kind !== 'mood' && kind !== 'snapshot';

interface GardenRow {
  id: string;
  title: string | null;
  description: string | null;
  created: string;
  updated: string;
}
async function record(row: GardenRow): Promise<Cruxspace> {
  const members = await gardenMembers(row.id);
  return {
    version: 1,
    id: row.id,
    name: row.title || 'Untitled Garden',
    brief: row.description ?? '',
    cruxIds: members.filter((m) => works(m.kind)).map((m) => m.id),
    created: row.created,
    updated: row.updated,
  };
}

/** Every Garden with at least one Crux to work on, by name. */
async function gardenListCruxspaces(): Promise<Cruxspace[]> {
  const rows = await getSqliteClient().all<GardenRow>(
    "SELECT id, title, description, created, updated FROM cruxes WHERE kind = 'garden' AND deleted IS NULL",
  );
  const spaces = await Promise.all(rows.map(record));
  return spaces.filter((s) => s.cruxIds.length).sort((a, b) => a.name.localeCompare(b.name));
}
async function gardenGetCruxspace(id: string): Promise<Cruxspace> {
  const row = await getSqliteClient().get<GardenRow>(
    "SELECT id, title, description, created, updated FROM cruxes WHERE id = ? AND kind = 'garden' AND deleted IS NULL",
    [id],
  );
  if (!row) throw new Error('This Garden is no longer available.');
  return record(row);
}

function values(input: CruxspaceInput): CruxspaceInput {
  const name = input.name.trim();
  if (!name || name.length > 120 || input.brief.length > 8000)
    throw new Error('Use a name up to 120 characters and a brief up to 8,000 characters.');
  const cruxIds = [...new Set(input.cruxIds)];
  if (cruxIds.length > 100) throw new Error('A Garden can gather up to 100 Cruxes here.');
  return { name, brief: input.brief, cruxIds };
}

/** Place a Crux in a Garden: plant it if unplaced, otherwise move its one placement. */
export async function placeInGarden(gardenId: string, cruxId: string): Promise<void> {
  const membership = getSqliteClient().gardenMembership;
  if (!membership) throw new Error('Gardens are unavailable on this connection.');
  const parents = (await membership.parents(cruxId)).map((p) => p.id);
  if (parents.includes(gardenId)) return;
  if (!parents.length) await membership.add({ gardenId, memberId: cruxId });
  else await membership.move({ gardenId, memberId: cruxId, expectedParents: parents });
}

/** A new Garden inside the active one, gathering the chosen Cruxes. */
async function gardenCreateCruxspace(
  input: CruxspaceInput,
  parentId = captureGardenId() ?? useGardenContext.getState().root?.id,
): Promise<Cruxspace> {
  const v = values(input);
  if (!parentId) throw new Error('Open a Garden first.');
  const garden = await getServices().crux.create({
    title: v.name,
    description: v.brief,
    kind: 'garden',
    gardenId: parentId,
  });
  for (const id of v.cruxIds) await placeInGarden(garden.id, id);
  collectionsChanged();
  return gardenGetCruxspace(garden.id);
}

/** Rename, re-brief and regather; Cruxes left out return to the Garden above. */
async function gardenUpdateCruxspace(id: string, input: CruxspaceInput): Promise<Cruxspace> {
  const v = values(input);
  const previous = await gardenGetCruxspace(id);
  await getServices().crux.update(id, { title: v.name, description: v.brief });
  const parent = (await getSqliteClient().gardenMembership?.parents(id))?.[0]?.id;
  for (const cruxId of v.cruxIds) await placeInGarden(id, cruxId);
  for (const cruxId of previous.cruxIds.filter((c) => !v.cruxIds.includes(c)))
    if (parent) await placeInGarden(parent, cruxId);
  collectionsChanged();
  return gardenGetCruxspace(id);
}

/** Retire the Garden. Its Cruxes move to the Garden above; nothing is deleted. */
async function gardenDeleteCruxspace(id: string): Promise<void> {
  const space = await gardenGetCruxspace(id).catch(() => null);
  if (!space) return;
  const parent = (await getSqliteClient().gardenMembership?.parents(id))?.[0]?.id;
  if (parent) for (const cruxId of space.cruxIds) await placeInGarden(parent, cruxId);
  await getServices().crux.delete(id);
  collectionsChanged();
}

export const listCruxspaces = (): Promise<Cruxspace[]> =>
  graph() ? gardenListCruxspaces() : listRecords();
export const getCruxspace = (id: string): Promise<Cruxspace> =>
  graph() ? gardenGetCruxspace(id) : getRecord(id);
export const createCruxspace = (input: CruxspaceInput): Promise<Cruxspace> =>
  graph() ? gardenCreateCruxspace(input) : createRecord(input);
export const updateCruxspace = (id: string, input: CruxspaceInput): Promise<Cruxspace> =>
  graph() ? gardenUpdateCruxspace(id, input) : updateRecord(id, input);
export const deleteCruxspace = (id: string): Promise<void> =>
  graph() ? gardenDeleteCruxspace(id) : deleteRecord(id);

// ── Settings records: connections without a Garden graph (Web Mode) ──────────
async function listRecords(): Promise<Cruxspace[]> {
  const rows = await getSqliteClient().all<{ value: string }>(
    'SELECT value FROM settings WHERE key LIKE ? ORDER BY key',
    [PREFIX + '%'],
  );
  return rows
    .map((row) => JSON.parse(row.value) as Cruxspace)
    .sort((a, b) => a.name.localeCompare(b.name));
}
async function getRecord(id: string): Promise<Cruxspace> {
  const row = await getSqliteClient().get<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [PREFIX + id],
  );
  if (!row) throw new Error('This Cruxspace is no longer available.');
  return JSON.parse(row.value) as Cruxspace;
}
async function recordValues(input: CruxspaceInput): Promise<CruxspaceInput> {
  const name = input.name.trim();
  if (!name || name.length > 120 || input.brief.length > 8000)
    throw new Error('Use a name up to 120 characters and a brief up to 8,000 characters.');
  const cruxIds = [...new Set(input.cruxIds)];
  if (cruxIds.length > 100) throw new Error('A Cruxspace can contain up to 100 Cruxes.');
  const live = new Set((await getServices().crux.listAll()).map((c) => c.id));
  if (cruxIds.some((id) => !live.has(id)))
    throw new Error('Choose Cruxes available in your Garden.');
  return { name, brief: input.brief, cruxIds };
}
async function createRecord(input: CruxspaceInput): Promise<Cruxspace> {
  const values = await recordValues(input);
  const now = new Date().toISOString();
  const space: Cruxspace = {
    ...values,
    version: 1,
    id: crypto.randomUUID(),
    created: now,
    updated: now,
  };
  await getSqliteClient().run('INSERT INTO settings (key, value) VALUES (?, ?)', [
    PREFIX + space.id,
    JSON.stringify(space),
  ]);
  collectionsChanged();
  return space;
}
/** Record a Cruxspace with a chosen identity (package import); members must already exist. */
export async function insertCruxspace(
  input: CruxspaceInput & { id: string; created?: string; origin?: CruxspaceOrigin },
): Promise<Cruxspace> {
  const values = await recordValues(input);
  if (await getRecord(input.id).catch(() => null))
    throw new Error('A Cruxspace with this identity already exists.');
  const now = new Date().toISOString();
  const space: Cruxspace = {
    ...values,
    version: 1,
    id: input.id,
    created: input.created && Number.isFinite(Date.parse(input.created)) ? input.created : now,
    updated: now,
    ...(input.origin ? { origin: input.origin } : {}),
  };
  await getSqliteClient().run('INSERT INTO settings (key, value) VALUES (?, ?)', [
    PREFIX + space.id,
    JSON.stringify(space),
  ]);
  collectionsChanged();
  return space;
}
async function updateRecord(id: string, input: CruxspaceInput): Promise<Cruxspace> {
  const values = await recordValues(input);
  const previous = await getRecord(id);
  const space = { ...previous, ...values, updated: new Date().toISOString() };
  const result = await getSqliteClient().run('UPDATE settings SET value = ? WHERE key = ?', [
    JSON.stringify(space),
    PREFIX + id,
  ]);
  if (!result.changes) throw new Error('This Cruxspace is no longer available.');
  collectionsChanged();
  return space;
}
async function deleteRecord(id: string): Promise<void> {
  await getSqliteClient().run('DELETE FROM settings WHERE key = ?', [PREFIX + id]);
  collectionsChanged();
}
