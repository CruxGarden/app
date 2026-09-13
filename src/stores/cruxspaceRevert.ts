import { getServices } from '@/services';
import { getSqliteClient } from '@/services/sqlite/client';
import { getCruxspace } from '@/services/cruxspaces';
import { setCruxspaceMoment, snapshotIndexAt } from '@/services/cruxspace-moment';
import { growthHostFor } from '@/services/growth';
import { listWorkingCopies } from '@/services/working-copies';
import { isJobActive, type TurnJob } from '@/services/turn-jobs';
import {
  allWorkspaces,
  closeWorkspace,
  openWorkspace,
  useWorkspaceRegistry,
} from './workspaceRegistry';

/**
 * Reverting a whole Cruxspace to a moment (plan G11): every member goes back
 * to its last checkpoint at or before that moment, files on disk included,
 * through the same per-Crux restore Growth already offers (safety checkpoint
 * first, so it is reversible). Work in flight blocks the whole operation and
 * is named, never stopped silently; member workspaces are closed with their
 * documents saved and reopened afterwards so running apps reload from the
 * reverted Project Folder.
 */
export interface CruxspaceRevertMember {
  id: string;
  title: string;
  /** The checkpoint the member returns to; null when it did not exist yet. */
  snapshotId: string | null;
  label: string | null;
}
export interface CruxspaceRevertPlan {
  members: CruxspaceRevertMember[];
  /** Reasons the revert cannot run now, one per member. */
  blockers: string[];
}
export interface CruxspaceRevertReport {
  reverted: string[];
  skipped: string[];
}

export async function planCruxspaceRevert(
  spaceId: string,
  at: string,
): Promise<CruxspaceRevertPlan> {
  const space = await getCruxspace(spaceId);
  const { crux, dimension } = getServices();
  const db = getSqliteClient();
  const live = new Map((await crux.listAll()).map((c) => [c.id, c]));
  const members: CruxspaceRevertMember[] = [];
  const blockers: string[] = [];
  for (const id of space.cruxIds) {
    const member = live.get(id);
    if (!member) continue;
    const title = member.title || 'Untitled';
    const growths = (await dimension.findBySourceAndType(id, 'growth').catch(() => [])).sort(
      (a, b) => (a.weight ?? 0) - (b.weight ?? 0),
    );
    const index = snapshotIndexAt(growths, at);
    const growth = index === null ? null : growths[index]!;
    members.push({
      id,
      title,
      snapshotId: growth?.targetId ?? null,
      label:
        growth && typeof growth.meta?.label === 'string' && growth.meta.label
          ? growth.meta.label
          : growth
            ? `Checkpoint ${index! + 1}`
            : null,
    });
    // Work in flight, open or persisted.
    const open = allWorkspaces().filter((w) => w.cruxId === id || w.id === id);
    for (const w of open) {
      const s = w.data.getState();
      if (s.isStreaming || isJobActive(s.turnJob))
        blockers.push(`${title}: a Collaboration turn is running.`);
      else if (s.publishPhase || s.uploadProgress)
        blockers.push(`${title}: publishing or an upload is in progress.`);
      else if (s.pendingDeletes.length || w.ui.getState().pendingAgentApprovals.length)
        blockers.push(`${title}: an approval is waiting.`);
    }
    if (!open.length && isJobActive(member.meta?.turnJob as TurnJob | null))
      blockers.push(`${title}: a Collaboration turn is still recorded as running.`);
    const tasks = (await listWorkingCopies(id)).filter((c) =>
      ['preparing', 'ready'].includes(c.phase),
    );
    if (tasks.length)
      blockers.push(
        `${title}: finish or abandon its open Task${tasks.length > 1 ? 's' : ''} (${tasks.map((t) => t.title).join(', ')}).`,
      );
    const merging = await db.get<{ id: string }>(
      "SELECT id FROM task_merges WHERE crux_id = ? AND phase = 'applying'",
      [id],
    );
    if (merging) blockers.push(`${title}: a merge is being applied.`);
  }
  return { members, blockers: [...new Set(blockers)] };
}

export async function revertCruxspaceTo(
  spaceId: string,
  at: string,
): Promise<CruxspaceRevertReport> {
  const plan = await planCruxspaceRevert(spaceId, at);
  if (plan.blockers.length)
    throw new Error(`Stop the work in progress first:\n${plan.blockers.join('\n')}`);
  const targets = plan.members.filter((m) => m.snapshotId);
  const skipped = plan.members.filter((m) => !m.snapshotId).map((m) => m.title);
  // Close member workspaces (documents saved) so every app reloads from the reverted folder.
  const wasOpen = allWorkspaces()
    .filter((w) => targets.some((m) => m.id === w.cruxId || m.id === w.id))
    .map((w) => w.id);
  const active = useWorkspaceRegistry.getState().activeId;
  for (const id of wasOpen) await closeWorkspace(id, { documents: 'save' });
  const reverted: string[] = [];
  try {
    for (const member of targets) {
      const host = await growthHostFor(member.id);
      await host.restore(member.snapshotId!, { requestedBy: 'person' });
      reverted.push(member.title);
    }
  } finally {
    for (const id of wasOpen) await openWorkspace(id).catch(console.error);
    if (active && wasOpen.includes(active))
      useWorkspaceRegistry.setState((r) => ({ ...r, activeId: active }));
    // The moment is now the present.
    setCruxspaceMoment(null);
  }
  return { reverted, skipped };
}
