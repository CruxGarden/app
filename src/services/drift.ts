/**
 * What changed on this machine since a moment in time (RESILIENCE-PLAN §3,
 * scenario 6). A crux counts as changed when its record or any of its files
 * was updated after the moment — editing a file does not touch the crux row,
 * so the artifacts table is the honest signal. Used before a pull, which would
 * overwrite that work.
 */
import { getSqliteClient } from '@/services/sqlite/client';
import type { Crux } from '@/api/types';

/** Newest update per crux across the crux row and its files, as epoch ms. */
export async function latestChangeByCrux(cruxes: Crux[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const c of cruxes) out.set(c.id, new Date(c.updated).getTime() || 0);
  try {
    const rows = await getSqliteClient().all<{ resource_id: string; updated: string }>(
      "SELECT resource_id, MAX(updated) AS updated FROM artifacts WHERE resource_type = 'crux' AND type = 'artifact' GROUP BY resource_id",
    );
    for (const r of rows) {
      const t = new Date(r.updated).getTime() || 0;
      if (out.has(r.resource_id) && t > (out.get(r.resource_id) ?? 0)) out.set(r.resource_id, t);
    }
  } catch {
    /* the crux rows alone will have to do */
  }
  return out;
}

/** Cruxes changed here after `sinceIso` (with a little slack for clock skew). */
export async function cruxesChangedSince(
  cruxes: Crux[],
  sinceIso: string,
  slackMs = 5_000,
): Promise<Crux[]> {
  const since = new Date(sinceIso).getTime();
  if (!Number.isFinite(since)) return [];
  const latest = await latestChangeByCrux(cruxes);
  return cruxes.filter((c) => (latest.get(c.id) ?? 0) > since + slackMs);
}
