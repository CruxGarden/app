import { getSqliteClient } from './client';

/** References which keep a snapshot alive, beyond its owning Growth edge. */
const historyReferences = [
  'SELECT source_id, target_id FROM dimensions',
  ...['cruxes', 'working_copies'].flatMap((table) =>
    [
      'parentCruxId',
      'settings.activeBranch',
      'merge.sourceHead',
      'merge.targetHead',
      'merge.baseId',
    ].map((path) => `SELECT id, json_extract(meta, '$.${path}') FROM ${table}`),
  ),
  'SELECT id, base_snapshot_id FROM working_copies',
  'SELECT crux_id, candidate_id FROM task_merges',
  ...[
    'sourceHead',
    'targetHead',
    'resultHead',
    'baseId',
    'sourceState.workspace.parentId',
    'targetState.workspace.parentId',
    'resultState.workspace.parentId',
    'targetWorkspace.parentId',
  ].map((path) => `SELECT crux_id, json_extract(data, '$.${path}') FROM task_merges`),
].join('\nUNION\n');

/**
 * Guard both snapshot and Artifact removal: Growth removes the file rows
 * before the snapshot row. A refusal only in crux.delete would be too late.
 * One owning Growth edge (and its Main's activeBranch) is expected; other
 * graph/history references must survive an attempted tip removal.
 */
export async function assertSnapshotUnshared(snapshotId: string): Promise<void> {
  const row = await getSqliteClient().get(
    `WITH refs(origin, target) AS (${historyReferences})
    SELECT c.id FROM cruxes c WHERE c.id = ? AND c.kind = 'snapshot' AND (
      (SELECT COUNT(DISTINCT source_id) FROM dimensions
        WHERE target_id = c.id AND type = 'growth') > 1
      OR EXISTS (SELECT 1 FROM dimensions d WHERE d.target_id = c.id AND (
        d.type != 'growth' OR (json_extract(c.meta, '$.contentOwnerId') IS NOT NULL
          AND json_extract(c.meta, '$.contentOwnerId') != d.source_id)))
      OR EXISTS (SELECT 1 FROM refs r WHERE r.target = c.id AND r.origin != c.id
        AND r.origin NOT IN (SELECT source_id FROM dimensions
          WHERE target_id = c.id AND type = 'growth'))
    )`,
    [snapshotId],
  );
  if (row) throw new Error('This snapshot is shared or referenced by other work.');
}
