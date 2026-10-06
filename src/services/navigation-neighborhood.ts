import type { DimensionType } from '@/api/types';
import type { GardenIdentity } from '@/stores/gardenContext';
import { getSqliteClient } from './sqlite/client';

export interface NavigationLink {
  id: string;
  type: DimensionType;
  kind: string | null;
  group: DimensionType;
  direction: 'incoming' | 'outgoing';
  node: GardenIdentity;
  available: boolean;
}
export interface Neighborhood {
  center: GardenIdentity;
  links: NavigationLink[];
  next: string | null;
}
/** Identity-only, bounded projection of actual edges. Incoming placement is a
 * Gate in the view; its stored identity/type/direction are retained unchanged.
 * A second hop is another explicit page read, never recursive graph loading. */
export async function navigationNeighborhood(id: string, after = ''): Promise<Neighborhood> {
  const db = getSqliteClient();
  const center = await db.get<GardenIdentity>(
    'SELECT id, title, slug, kind FROM cruxes WHERE id = ? AND deleted IS NULL',
    [id],
  );
  if (!center) throw new Error('This Crux or Garden is unavailable.');
  const rows = await db.all<{
    id: string;
    type: DimensionType;
    kind: string | null;
    sourceId: string;
    nodeId: string;
    title: string | null;
    slug: string | null;
    nodeKind: string | null;
    available: number;
  }>(
    `SELECT d.id, d.type, d.kind, d.source_id AS sourceId,
      CASE WHEN d.source_id = ? THEN d.target_id ELSE d.source_id END AS nodeId,
      CASE WHEN n.id IS NOT NULL THEN COALESCE(
        CASE WHEN n.kind = 'snapshot' THEN json_extract(d.meta, '$.label') END, n.title) END AS title,
      n.slug, n.kind AS nodeKind, n.id IS NOT NULL AS available
    FROM dimensions d
    LEFT JOIN cruxes n ON n.id = CASE WHEN d.source_id = ? THEN d.target_id ELSE d.source_id END
      AND n.deleted IS NULL
    WHERE (d.source_id = ? OR d.target_id = ?) AND d.deleted IS NULL
      AND d.type IN ('gate', 'garden', 'growth', 'graft') AND d.id > ?
    ORDER BY d.id LIMIT 51`,
    [id, id, id, id, after],
  );
  const page = rows.slice(0, 50);
  return {
    center,
    next: rows.length > 50 ? page.at(-1)!.id : null,
    links: page.map((row) => ({
      id: row.id,
      type: row.type,
      kind: row.kind,
      group:
        row.type === 'garden' && row.kind === 'membership' && row.sourceId !== id
          ? 'gate'
          : row.type,
      direction: row.sourceId === id ? 'outgoing' : 'incoming',
      node: {
        id: row.nodeId,
        title: row.title ?? undefined,
        slug: row.slug ?? '',
        kind: row.nodeKind,
      },
      available: !!row.available,
    })),
  };
}

/** A version opens inside its owning Main's existing Growth explorer. It is not
 * assigned a placement or opened as an independent editable Crux. */
export async function navigationVersionTarget(
  id: string,
): Promise<{ cruxId: string; growthId: string }> {
  const owners = await getSqliteClient().all<{ id: string }>(
    `SELECT DISTINCT c.id FROM dimensions d
     JOIN cruxes version ON version.id = d.target_id AND version.kind = 'snapshot' AND version.deleted IS NULL
     LEFT JOIN working_copies w ON w.id = d.source_id AND w.role = 'task'
     JOIN cruxes c ON c.id = COALESCE(w.crux_id, d.source_id) AND c.deleted IS NULL AND (c.kind IS NULL OR c.kind != 'snapshot')
     WHERE d.type = 'growth' AND d.target_id = ? AND d.deleted IS NULL LIMIT 2`,
    [id],
  );
  if (owners.length !== 1) throw new Error('This version’s owner is unavailable or ambiguous.');
  return { cruxId: owners[0]!.id, growthId: id };
}
