import { getSqliteClient } from './sqlite/client';
import { getServices } from './index';

/** Durable content metadata, independent of the open-workspace session list. */
export interface Cruxspace {
  version: 1;
  id: string;
  name: string;
  brief: string;
  cruxIds: string[];
  created: string;
  updated: string;
}
export type CruxspaceInput = Pick<Cruxspace, 'name' | 'brief' | 'cruxIds'>;
const PREFIX = 'cruxgarden:cruxspace:';
export const CRUXSPACES_CHANGED = 'cruxspaces:changed';
function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CRUXSPACES_CHANGED));
}
export async function listCruxspaces(): Promise<Cruxspace[]> {
  const rows = await getSqliteClient().all<{ value: string }>(
    'SELECT value FROM settings WHERE key LIKE ? ORDER BY key',
    [PREFIX + '%'],
  );
  return rows
    .map((row) => JSON.parse(row.value) as Cruxspace)
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getCruxspace(id: string): Promise<Cruxspace> {
  const row = await getSqliteClient().get<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [PREFIX + id],
  );
  if (!row) throw new Error('This Cruxspace is no longer available.');
  return JSON.parse(row.value) as Cruxspace;
}
async function inputValues(input: CruxspaceInput): Promise<CruxspaceInput> {
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
export async function createCruxspace(input: CruxspaceInput): Promise<Cruxspace> {
  const values = await inputValues(input);
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
  changed();
  return space;
}
export async function updateCruxspace(id: string, input: CruxspaceInput): Promise<Cruxspace> {
  const values = await inputValues(input);
  const previous = await getCruxspace(id);
  const space = { ...previous, ...values, updated: new Date().toISOString() };
  const result = await getSqliteClient().run('UPDATE settings SET value = ? WHERE key = ?', [
    JSON.stringify(space),
    PREFIX + id,
  ]);
  if (!result.changes) throw new Error('This Cruxspace is no longer available.');
  changed();
  return space;
}
export async function deleteCruxspace(id: string): Promise<void> {
  await getSqliteClient().run('DELETE FROM settings WHERE key = ?', [PREFIX + id]);
  changed();
}
