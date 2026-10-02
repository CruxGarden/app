import type { Crux, CruxMeta } from '@/api/types';
import { getSqliteClient } from './sqlite/client';
import { taskStorage } from './task-storage';
import { fromRow } from './sqlite/helpers';

/** Durable copy identity is distinct from its owning Crux and open UI lifetime. */
export interface WorkingCopy {
  id: string;
  cruxId: string;
  taskId: string;
  title: string;
  /** Immutable starting state retained by the native API. */
  baseState: {
    /** The exact Task source; absence means Main. */
    sourceId?: string;
    root: string;
    workspace: { parentId: string | null; messages: unknown[]; entryFile: string | null };
  };
  role: 'task' | 'review';
  phase: 'preparing' | 'ready' | 'merged' | 'archived' | 'failed';
  meta: CruxMeta;
  projectFolder: string | null;
  revision: number;
  created: string;
  updated: string;
}
export type CopyIdentity = Pick<WorkingCopy, 'cruxId' | 'taskId' | 'phase' | 'role' | 'title'> & {
  baseParentId: string | null;
};
export const TASKS_CHANGED = 'crux:tasks-changed';
export function announceTasksChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TASKS_CHANGED));
}
export function copyIdentity(crux: Crux | null | undefined): CopyIdentity | null {
  return (crux?.meta?.workingCopy as CopyIdentity | undefined) ?? null;
}
function copyFromRow(row: Record<string, unknown>): WorkingCopy {
  const copy = fromRow<WorkingCopy>(row);
  if (typeof row.base_state !== 'string') throw new Error('Task starting state is missing.');
  copy.baseState = JSON.parse(row.base_state);
  return copy;
}
export async function findWorkingCopy(id: string): Promise<WorkingCopy | null> {
  const row = await getSqliteClient().get('SELECT * FROM working_copies WHERE id = ?', [id]);
  return row ? copyFromRow(row) : null;
}
/** Every open Task copy on this device, oldest first. */
export async function listTaskCopies(): Promise<WorkingCopy[]> {
  const rows = await getSqliteClient().all(
    "SELECT * FROM working_copies WHERE role = 'task' ORDER BY created, id",
  );
  return rows.map(copyFromRow);
}

/** The saved metadata of a content owner — a Crux, or a Working Copy with the same id shape. */
export async function ownerMeta(id: string): Promise<Record<string, unknown> | null> {
  const row = await getSqliteClient().get<{ meta: string | null }>(
    'SELECT meta FROM cruxes WHERE id = ? UNION ALL SELECT meta FROM working_copies WHERE id = ?',
    [id, id],
  );
  return row ? (JSON.parse(row.meta || '{}') as Record<string, unknown>) : null;
}

export async function listWorkingCopies(cruxId: string): Promise<WorkingCopy[]> {
  const rows = await getSqliteClient().all(
    "SELECT * FROM working_copies WHERE crux_id = ? AND role = 'task' ORDER BY created, id",
    [cruxId],
  );
  return rows.map(copyFromRow);
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
        baseParentId: copy.baseState.workspace.parentId,
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
  const db = taskStorage();
  // Capture before waiting behind a Task operation; the API captures again at admission.
  const captured = JSON.parse(JSON.stringify(patch));
  return serializeCopy(id, async () => {
    await db.updateWorkingCopyMeta(id, captured, title);
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
    [copy?.cruxId ?? id],
  );
  if (pending)
    throw new Error('Finish recovering the pending merge before editing this workspace.');
}

export async function assertNoOpenTasks(cruxId: string): Promise<void> {
  const copies = await listWorkingCopies(cruxId);
  if (!copies.length) return;
  const ids = new Set([cruxId, ...copies.map((c) => c.id)]);
  const { useWorkspaceRegistry } = await import('@/stores/workspaceRegistry');
  if (useWorkspaceRegistry.getState().entries.some((w) => ids.has(w.id)))
    throw new Error('Close Main and its tasks before deleting this Crux.');
}
