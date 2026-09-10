import type { Crux, CruxMeta } from '@/api/types';
import { getSqliteClient } from './sqlite/client';
import { fromRow } from './sqlite/helpers';

/** Durable copy identity is distinct from its owning Crux and open UI lifetime. */
export interface WorkingCopy {
  id: string;
  cruxId: string;
  taskId: string;
  title: string;
  baseSnapshotId: string;
  role: 'task' | 'review';
  phase: 'preparing' | 'ready' | 'merged' | 'archived' | 'failed';
  meta: CruxMeta;
  projectFolder: string | null;
  revision: number;
  created: string;
  updated: string;
}
export type CopyIdentity = Pick<
  WorkingCopy,
  'cruxId' | 'taskId' | 'baseSnapshotId' | 'phase' | 'role' | 'title'
>;
export const TASKS_CHANGED = 'crux:tasks-changed';
export function announceTasksChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TASKS_CHANGED));
}
export function copyIdentity(crux: Crux | null | undefined): CopyIdentity | null {
  return (crux?.meta?.workingCopy as CopyIdentity | undefined) ?? null;
}
export async function findWorkingCopy(id: string): Promise<WorkingCopy | null> {
  const row = await getSqliteClient().get('SELECT * FROM working_copies WHERE id = ?', [id]);
  return row ? fromRow<WorkingCopy>(row) : null;
}
export async function listWorkingCopies(cruxId: string): Promise<WorkingCopy[]> {
  const rows = await getSqliteClient().all(
    "SELECT * FROM working_copies WHERE crux_id = ? AND role = 'task' ORDER BY created, id",
    [cruxId],
  );
  return rows.map((row) => fromRow<WorkingCopy>(row));
}

/** Legacy workspace consumers read a Crux-shaped document; it is never a Crux row. */
export async function workingCopyDocument(id: string): Promise<Crux | null> {
  const copy = await findWorkingCopy(id);
  if (!copy) return null;
  const row = await getSqliteClient().get('SELECT * FROM cruxes WHERE id = ? AND deleted IS NULL', [
    copy.cruxId,
  ]);
  if (!row) throw new Error('This task’s Crux is missing or in Recently deleted.');
  const owner = fromRow<Crux>(row);
  return {
    ...owner,
    id: copy.id,
    type: 'working-copy',
    title: `${owner.title} · ${copy.title}`,
    slug: `task-${copy.id}`,
    visibility: 'private',
    discoverable: false,
    meta: {
      ...copy.meta,
      ...(copy.projectFolder ? { projectFolder: copy.projectFolder } : {}),
      workingCopy: {
        title: copy.title,
        cruxId: copy.cruxId,
        taskId: copy.taskId,
        baseSnapshotId: copy.baseSnapshotId,
        role: copy.role,
        phase: copy.phase,
      },
    },
    created: copy.created,
    updated: copy.updated,
  };
}

const queues = new Map<string, Promise<unknown>>();
export function serializeCopy<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(operation);
  queues.set(id, next);
  void next
    .finally(() => {
      if (queues.get(id) === next) queues.delete(id);
    })
    .catch(() => {});
  return next;
}
export async function updateCopyMeta(
  id: string,
  patch: Record<string, unknown>,
  title?: string,
): Promise<Crux> {
  return serializeCopy(id, async () => {
    const copy = await findWorkingCopy(id);
    if (!copy) throw new Error('Working Copy not found.');
    const meta = { ...copy.meta, ...patch } as Record<string, unknown>;
    delete meta.workingCopy;
    delete meta.projectFolder;
    const result = await getSqliteClient().run(
      'UPDATE working_copies SET meta = ?, title = COALESCE(?, title), revision = revision + 1, updated = ? WHERE id = ? AND revision = ?',
      [
        JSON.stringify(meta),
        title === undefined ? null : title.trim() || 'Untitled task',
        new Date().toISOString(),
        id,
        copy.revision,
      ],
    );
    if (result.changes !== 1)
      throw new Error('This task changed while saving. Reload it before retrying.');
    announceTasksChanged();
    return (await workingCopyDocument(id))!;
  });
}
export async function assertMainWorkspace(id: string): Promise<void> {
  if (await findWorkingCopy(id))
    throw new Error('This action belongs to Main. Open Main to continue.');
}
export const lockedContentOwners = new Set<string>();
export async function assertCopyWritable(id: string): Promise<void> {
  if (lockedContentOwners.has(id))
    throw new Error('Wait for this task operation to finish before editing.');
  const copy = await findWorkingCopy(id);
  if (copy && !['ready', 'preparing'].includes(copy.phase))
    throw new Error('This task is closed for editing. Start a new task from Main.');
  const pending = await getSqliteClient().get(
    "SELECT id FROM task_merges WHERE crux_id = ? AND phase = 'applying'",
    [id],
  );
  if (pending) throw new Error('Finish recovering the pending merge before editing Main.');
}

/** Protect all ancestry referenced by a task, including a retained merge candidate. */
export async function isTaskHistoryReference(snapshotId: string): Promise<boolean> {
  const row = await getSqliteClient().get(
    `
    WITH RECURSIVE roots(id) AS (
      SELECT base_snapshot_id FROM working_copies
      UNION SELECT json_extract(meta, '$.merge.sourceHead') FROM cruxes
      UNION SELECT json_extract(meta, '$.merge.targetHead') FROM cruxes
      UNION SELECT json_extract(data, '$.sourceHead') FROM task_merges
      UNION SELECT json_extract(data, '$.targetHead') FROM task_merges
      UNION SELECT json_extract(data, '$.resultHead') FROM task_merges
    ), links(parent, child) AS (
      SELECT json_extract(meta, '$.parentCruxId'), id FROM cruxes
      UNION SELECT json_extract(meta, '$.merge.sourceHead'), id FROM cruxes
      UNION SELECT json_extract(meta, '$.merge.targetHead'), id FROM cruxes
    ), ancestry(id) AS (
      SELECT id FROM roots WHERE id IS NOT NULL
      UNION SELECT links.parent FROM links JOIN ancestry ON links.child = ancestry.id WHERE links.parent IS NOT NULL
    ) SELECT id FROM ancestry WHERE id = ? LIMIT 1`,
    [snapshotId],
  );
  return !!row;
}

export async function assertNoOpenTasks(cruxId: string): Promise<void> {
  const copies = await listWorkingCopies(cruxId);
  if (!copies.length) return;
  const ids = new Set([cruxId, ...copies.map((c) => c.id)]);
  const { useWorkspaceRegistry } = await import('@/stores/workspaceRegistry');
  if (useWorkspaceRegistry.getState().entries.some((w) => ids.has(w.id)))
    throw new Error('Close Main and its tasks before deleting this Crux.');
}
