import type { MosaicNode } from 'react-mosaic-component';
import type { StoreApi } from 'zustand';
import { DEFAULT_PANE_ORDER, type PaneType, type UIState } from '@/stores/uiStore';
import { getSetting, setSetting } from './settings';
import { SettingsKey } from '@/lib/constants';
import { flushNotebook } from './notebook-lifecycle';

export interface WorkspaceLayout {
  name: string;
  layout: MosaicNode<PaneType> | null;
}
const listeners = new Set<() => void>();
export function onWorkspaceLayoutsChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function nameOf(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 80)
    throw new Error('Give the workspace layout a name (1–80 characters).');
  return raw.trim();
}
/** Validate before touching the live layout; reject duplicate panes and recursive/huge trees. */
export function parseWorkspaceLayout(raw: unknown): MosaicNode<PaneType> | null {
  if (raw === null) return null;
  const seen = new Set<string>();
  const walk = (node: unknown, depth: number): MosaicNode<PaneType> => {
    if (depth > 20) throw new Error('Workspace layout is too deeply nested.');
    if (typeof node === 'string') {
      if (!DEFAULT_PANE_ORDER.includes(node as PaneType) || seen.has(node))
        throw new Error('Workspace layouts use each available panel at most once.');
      seen.add(node);
      return node as PaneType;
    }
    if (!node || typeof node !== 'object' || Array.isArray(node))
      throw new Error('Invalid workspace layout.');
    const n = node as Record<string, unknown>;
    if (n.direction !== 'row' && n.direction !== 'column')
      throw new Error('Split direction must be row or column.');
    const split = n.splitPercentage ?? 50;
    if (typeof split !== 'number' || !Number.isFinite(split) || split < 5 || split > 95)
      throw new Error('Panel split must be between 5 and 95 percent.');
    return {
      direction: n.direction,
      first: walk(n.first, depth + 1),
      second: walk(n.second, depth + 1),
      splitPercentage: split,
    };
  };
  return walk(raw, 0);
}
export function listWorkspaceLayouts(): WorkspaceLayout[] {
  try {
    const raw = JSON.parse(String(getSetting(SettingsKey.WorkspaceLayouts) || '[]'));
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 64).flatMap((item) => {
      try {
        return [{ name: nameOf(item.name), layout: parseWorkspaceLayout(item.layout) }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
function write(layouts: WorkspaceLayout[]) {
  if (layouts.length > 64) throw new Error('This garden can hold up to 64 workspace layouts.');
  setSetting(SettingsKey.WorkspaceLayouts, JSON.stringify(layouts));
  listeners.forEach((fn) => fn());
}
export function saveWorkspaceLayout(name: unknown, raw: unknown): WorkspaceLayout {
  const entry = { name: nameOf(name), layout: parseWorkspaceLayout(raw) };
  write([...listWorkspaceLayouts().filter((l) => l.name !== entry.name), entry]);
  return entry;
}
export function deleteWorkspaceLayout(name: string) {
  write(listWorkspaceLayouts().filter((l) => l.name !== name));
}
const applying = new WeakMap<StoreApi<UIState>, number>();
/** A reusable arrangement acts on the captured workspace; it never navigates or closes its runtime. */
export async function applyWorkspaceLayout(ui: StoreApi<UIState>, name: string) {
  const entry = listWorkspaceLayouts().find((l) => l.name === name);
  if (!entry) throw new Error('That workspace layout no longer exists.');
  const layout = parseWorkspaceLayout(entry.layout);
  const revision = (applying.get(ui) ?? 0) + 1;
  applying.set(ui, revision);
  const cruxId = ui.getState().activeCruxId;
  // Save embedded editors before any panel can unmount. A failed save leaves the layout intact.
  await flushNotebook(cruxId);
  if (applying.get(ui) !== revision || ui.getState().activeCruxId !== cruxId) return;
  ui.getState().setMosaicLayout(layout);
}
