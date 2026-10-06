import { getSqliteClient } from './sqlite/client';
import { fromRow } from './sqlite/helpers';
import type { Crux } from '@/api/types';
import { useGardenContext, type GardenIdentity } from '@/stores/gardenContext';

/** Hydrate only this Garden's bounded API projection; never infer membership. */
/** Moods live in the Mood panel, not among a Garden's things to open. */
export const opensAsWorkspace = (crux: Pick<Crux, 'kind'>) => crux.kind !== 'mood';

export async function gardenMembers(gardenId: string): Promise<Crux[]> {
  const db = getSqliteClient();
  if (!db.gardenMembership) throw new Error('Garden navigation is unavailable on this connection.');
  const result: Crux[] = [];
  let after: string | undefined;
  do {
    const page = await db.gardenMembership.list(gardenId, {
      limit: 100,
      ...(after ? { after } : {}),
    });
    const ids = page.items.map((row) => row.id);
    if (ids.length) {
      const rows = await db.all(
        `SELECT * FROM cruxes WHERE deleted IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      result.push(...rows.map((row) => fromRow<Crux>(row)));
    }
    after = page.next ?? undefined;
  } while (after);
  return result;
}

/** Read-only ancestry projection from the API-owned graph, not a saved UI tree.
 * UNION terminates even for damaged cyclic input; only live Gardens participate.
 */
export async function gardenAncestors(gardenId: string): Promise<string[]> {
  const rows = await getSqliteClient().all<{ id: string }>(
    `WITH RECURSIVE ancestors(id) AS (
      SELECT ?
      UNION
      SELECT d.source_id FROM dimensions d JOIN ancestors a ON d.target_id = a.id
      JOIN cruxes c ON c.id = d.source_id
      WHERE d.type = 'garden' AND d.kind = 'membership' AND d.deleted IS NULL
        AND c.kind = 'garden' AND c.deleted IS NULL
    ) SELECT id FROM ancestors`,
    [gardenId],
  );
  return rows.map((row) => row.id);
}

/** Ordered location, distinct from the unordered ancestor set used to reveal a Tree.
 * Multiple containers are shown as a choice, never resolved by picking the first.
 */
export async function gardenLocation(gardenId: string): Promise<{
  chain: GardenIdentity[];
  containers: GardenIdentity[];
}> {
  const db = getSqliteClient();
  if (!db.gardenMembership) throw new Error('Garden navigation is unavailable on this connection.');
  const read = async (id: string) => {
    const row = await db.get<GardenIdentity>(
      'SELECT id, title, slug, kind FROM cruxes WHERE id = ? AND kind = ? AND deleted IS NULL',
      [id, 'garden'],
    );
    if (!row) throw new Error('This Garden is no longer available. Reopen the Navigator.');
    return row;
  };
  const chain: GardenIdentity[] = [];
  const seen = new Set<string>();
  let id = gardenId;
  while (true) {
    if (seen.has(id)) throw new Error('This Garden’s location contains a cycle.');
    if (seen.size >= 256) throw new Error('This Garden’s location is too deep to display.');
    seen.add(id);
    chain.push(await read(id));
    const parents = await db.gardenMembership.parents(id);
    if (parents.length !== 1) {
      const containers = await Promise.all(parents.map((parent) => read(parent.id)));
      return { chain: chain.reverse(), containers };
    }
    id = parents[0]!.id;
  }
}

export type WorkspaceDestination =
  | { status: 'ready'; garden: GardenIdentity; cruxId: string | null }
  | { status: 'choose'; choices: (GardenIdentity & { available: boolean })[] }
  | { status: 'unplaced'; crux: GardenIdentity };

/** Resolve location from the real placement graph. A supplied Garden is a
 * preference for an ambiguous graph, never authority to invent membership. */
export async function resolveWorkspaceDestination(
  gardenId: string | undefined,
  cruxId: string | null,
): Promise<WorkspaceDestination> {
  const db = getSqliteClient();
  const read = async (id: string) => {
    const row = await db.get<GardenIdentity>(
      'SELECT id, title, slug, kind FROM cruxes WHERE id = ? AND deleted IS NULL',
      [id],
    );
    if (!row) throw new Error('This Crux or Garden is no longer available.');
    return row;
  };
  if (!cruxId) {
    if (!gardenId) throw new Error('Choose a Garden to open.');
    const garden = await read(gardenId);
    if (garden.kind !== 'garden') throw new Error('This location is not a Garden.');
    return { status: 'ready', garden, cruxId: null };
  }
  const crux = await read(cruxId);
  if (crux.kind === 'garden') return { status: 'ready', garden: crux, cruxId: null };
  if (crux.kind === 'snapshot') throw new Error('Open this version from its Crux’s Growth.');
  if (!db.gardenMembership) throw new Error('Garden navigation is unavailable on this connection.');
  const parents = await db.gardenMembership.parents(cruxId);
  if (!parents.length) return { status: 'unplaced', crux };
  const choices = parents.map((parent) => ({
    ...parent,
    available: parent.available && parent.kind === 'garden',
  }));
  const selected =
    choices.length === 1
      ? choices[0]
      : choices.find((parent) => parent.id === gardenId && parent.available);
  if (!selected) return { status: 'choose', choices };
  if (!selected.available) throw new Error('The Garden containing this Crux is unavailable.');
  const garden = await read(selected.id);
  if (garden.kind !== 'garden') throw new Error('The Garden containing this Crux is unavailable.');
  return { status: 'ready', garden, cruxId };
}

/** A Garden's name is its own title; the breadcrumb and Home read it at once. */
export async function renameGarden(id: string, title: string): Promise<void> {
  const next = title.trim().slice(0, 200);
  if (!next) return;
  const [{ getServices }, { collectionsChanged }] = await Promise.all([
    import('./index'),
    import('./cruxspaces'),
  ]);
  await getServices().crux.update(id, { title: next });
  const named = (g: GardenIdentity | null) => (g?.id === id ? { ...g, title: next } : g);
  useGardenContext.setState((s) => ({ garden: named(s.garden), root: named(s.root) }));
  collectionsChanged();
}

/** Whether this connection owns a Garden graph (desktop); Web Mode has none. */
export function hasGardenGraph(): boolean {
  return !!getSqliteClient().gardenMembership;
}
