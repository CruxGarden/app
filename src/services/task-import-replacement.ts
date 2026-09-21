import { getSqliteClient } from './sqlite/client';
import { buildInsertMany, insertChunks } from './sqlite/helpers';
import { closeCruxWorkspaces } from '@/stores/workspaceRegistry';
import { settleIngestion } from './ingestion';

type Row = Record<string, unknown> & { id: string };
type Table = 'cruxes' | 'working_copies' | 'artifacts' | 'dimensions' | 'store' | 'task_merges';
export type SavedTaskGraph = Map<Table, Row[]>;

/** Preserve the exact local rows, including review state and folder locations, for rollback. */
export async function captureReplacedTaskGraph(cruxId: string): Promise<SavedTaskGraph> {
  const db = getSqliteClient();
  if (await db.get("SELECT id FROM task_merges WHERE crux_id = ? AND phase = 'applying'", [cruxId]))
    throw new Error('Recover the pending task merge before replacing this Crux.');
  await closeCruxWorkspaces(cruxId, 'save');
  await settleIngestion();
  const copies = await db.all<Row>('SELECT * FROM working_copies WHERE crux_id = ?', [cruxId]);
  const owners = [cruxId, ...copies.map((copy) => copy.id)];
  const select = async (table: Table, field: string, ids: string[]): Promise<Row[]> => {
    const rows: Row[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      rows.push(
        ...(await db.all<Row>(
          `SELECT * FROM ${table} WHERE ${field} IN (${chunk.map(() => '?').join(',')})`,
          chunk,
        )),
      );
    }
    return rows;
  };
  const dimensions = await select('dimensions', 'source_id', owners);
  const snapshots = [
    ...new Set(dimensions.filter((d) => d.type === 'growth').map((d) => String(d.target_id))),
  ];
  return new Map<Table, Row[]>([
    ['cruxes', await select('cruxes', 'id', [cruxId, ...snapshots])],
    ['working_copies', copies],
    ['artifacts', await select('artifacts', 'resource_id', [...owners, ...snapshots])],
    ['dimensions', dimensions],
    ['store', await select('store', 'crux_id', owners)],
    ['task_merges', await select('task_merges', 'crux_id', [cruxId])],
  ]);
}

export async function removeReplacedTaskGraph(graph: SavedTaskGraph): Promise<void> {
  const db = getSqliteClient();
  for (const [table, rows] of [...graph.entries()].reverse()) {
    for (let i = 0; i < rows.length; i += 200) {
      const ids = rows.slice(i, i + 200).map((row) => row.id);
      await db.run(`DELETE FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    }
  }
}

export async function restoreReplacedTaskGraph(graph: SavedTaskGraph): Promise<void> {
  // Idempotent upserts also recover a failure partway through deleting the old graph.
  for (const [table, rows] of graph) {
    for (const chunk of insertChunks(rows)) {
      const insert = buildInsertMany(table, chunk);
      await getSqliteClient().run(
        insert.sql.replace(/^INSERT INTO/, 'INSERT OR REPLACE INTO'),
        insert.params,
      );
    }
  }
}
