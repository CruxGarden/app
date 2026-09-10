import { getWorkspace, workspaceTending } from '@/stores/workspaceRegistry';
import { targetMatches, type TendingTarget } from './tending-state';
import { turnsFor } from './turns';

export function tendingPath(target: { cruxId: string; copyId: string }): string {
  return `/c/${encodeURIComponent(target.cruxId)}${target.copyId === target.cruxId ? '' : `?task=${encodeURIComponent(target.copyId)}`}`;
}
export function validateTendingTarget(target: TendingTarget) {
  const workspace = getWorkspace(target.copyId);
  if (!workspace || !targetMatches(target, workspaceTending(workspace)))
    throw new Error('This work changed. Return to Tending for its current state.');
  return workspace;
}
/** Revalidate after confirmation as well as before: never stop a replacement turn. */
export function stopTendingTarget(target: TendingTarget): void {
  const w = validateTendingTarget(target);
  if (!workspaceTending(w).canStop) throw new Error('This work is no longer running.');
  turnsFor(w.data).stopTurn('stopped');
}
