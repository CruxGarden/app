import { getSqliteClient } from './sqlite/client';
import { fromRow } from './sqlite/helpers';
import type { Crux } from '@/api/types';

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
