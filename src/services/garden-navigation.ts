import { getSqliteClient } from './sqlite/client';
import { fromRow } from './sqlite/helpers';
import type { Crux } from '@/api/types';
import type { GardenIdentity } from '@/stores/gardenContext';

/** Hydrate only this Garden's bounded API projection; never infer membership. */
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
