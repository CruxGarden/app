import type { GardenIdentity } from '@/stores/gardenContext';
import { getSqliteClient } from './sqlite/client';

export interface NavigationSearchCursor {
  title: string;
  id: string;
}
export interface NavigationSearchItem extends GardenIdentity {
  location: string;
  locationState: 'ready' | 'unplaced' | 'ambiguous' | 'unavailable' | 'cycle' | 'limited';
}
export interface NavigationSearchPage {
  items: NavigationSearchItem[];
  next: NavigationSearchCursor | null;
}
/** Search identities, not file content or transcripts. Location is a bounded
 * projection of actual incoming placements, never another stored hierarchy. */
export async function searchNavigation(
  query: string,
  after?: NavigationSearchCursor,
): Promise<NavigationSearchPage> {
  const term = query.trim();
  if (!term) return { items: [], next: null };
  const db = getSqliteClient();
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const found = await db.all<GardenIdentity>(
    `SELECT c.id, COALESCE(c.title, '') AS title, c.slug, c.kind FROM cruxes c
     WHERE c.deleted IS NULL AND (c.kind IS NULL OR c.kind != 'snapshot')
       AND (c.kind IS NULL OR c.kind != 'tool' OR EXISTS (
         SELECT 1 FROM dimensions d WHERE d.target_id=c.id AND d.type='garden' AND d.kind='membership' AND d.deleted IS NULL))
       AND COALESCE(c.title, '') LIKE ? ESCAPE '\\'
       ${after ? "AND (COALESCE(c.title, '') > ? COLLATE NOCASE OR (COALESCE(c.title, '') = ? COLLATE NOCASE AND c.id > ?))" : ''}
     ORDER BY COALESCE(c.title, '') COLLATE NOCASE, c.id LIMIT 21`,
    [pattern, ...(after ? [after.title, after.title, after.id] : [])],
  );
  const page = found.slice(0, 20);
  if (!page.length) return { items: [], next: null };
  const ids = page.map((n) => n.id);
  const marks = ids.map(() => '?').join(',');
  // UNION terminates cycles. LIMIT bounds even a malformed multiply linked graph.
  const ancestors = await db.all<GardenIdentity & { available: number }>(
    `WITH RECURSIVE ancestry(id) AS (
       SELECT id FROM cruxes WHERE id IN (${marks})
       UNION
       SELECT d.source_id FROM dimensions d JOIN ancestry a ON d.target_id=a.id
       JOIN cruxes current ON current.id=a.id AND current.deleted IS NULL
       WHERE d.type='garden' AND d.kind='membership' AND d.deleted IS NULL LIMIT 257
     ) SELECT a.id,c.title,c.slug,c.kind,c.id IS NOT NULL AS available
       FROM ancestry a LEFT JOIN cruxes c ON c.id=a.id AND c.deleted IS NULL`,
    ids,
  );
  const edges = await db.all<{ sourceId: string; targetId: string }>(
    `SELECT source_id AS sourceId,target_id AS targetId FROM dimensions
      WHERE target_id IN (${ancestors.map(() => '?').join(',')})
        AND type='garden' AND kind='membership' AND deleted IS NULL LIMIT 513`,
    ancestors.map((n) => n.id),
  );
  const limited = ancestors.length === 257 || edges.length === 513;
  const nodes = new Map(ancestors.map((n) => [n.id, n]));
  const parents = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!parents.has(e.targetId)) parents.set(e.targetId, new Set());
    parents.get(e.targetId)!.add(e.sourceId);
  }
  const location = (
    node: GardenIdentity,
  ): Pick<NavigationSearchItem, 'location' | 'locationState'> => {
    if (limited) return { location: 'Location is too large to display', locationState: 'limited' };
    const chain: string[] = [];
    const seen = new Set([node.id]);
    let id = node.id;
    while (true) {
      const containers = [...(parents.get(id) ?? [])];
      if (containers.length > 1)
        return { location: 'Multiple Gardens', locationState: 'ambiguous' };
      if (!containers.length) {
        if (!chain.length && node.kind !== 'garden')
          return { location: 'Not in a Garden', locationState: 'unplaced' };
        return { location: chain.reverse().join(' › ') || 'Root Garden', locationState: 'ready' };
      }
      id = containers[0]!;
      if (seen.has(id)) return { location: 'Location contains a cycle', locationState: 'cycle' };
      seen.add(id);
      const parent = nodes.get(id);
      if (!parent?.available || parent.kind !== 'garden')
        return { location: 'Containing Garden unavailable', locationState: 'unavailable' };
      chain.push(parent.title || 'Untitled Garden');
    }
  };
  return {
    items: page.map((node) => ({ ...node, ...location(node) })),
    next: found.length > 20 ? { title: page.at(-1)!.title ?? '', id: page.at(-1)!.id } : null,
  };
}
