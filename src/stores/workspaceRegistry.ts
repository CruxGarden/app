import { tendingState, tendingLabel, type TendingState } from '@/services/tending-state';
import { findWorkingCopy } from '@/services/working-copies';
import { maintainNotesManifest } from '@/services/notes-manifest';
import { registerPreviewOwner } from '@/services/preview-owners';
import { setActivePreview } from '@/lib/preview-registry';
import { create } from 'zustand';
import { createCruxStore, type CruxState } from './cruxStore';
import { createUIStore } from './uiStore';
import {
  workspaceSelection,
  workspaceOperations,
  type WorkspaceStores,
} from './workspaceSelection';
import { getSetting, setSetting, flushSettings } from '@/services/settings';
import { getServices } from '@/services';
import { turnsFor } from '@/services/turns';
import { documentsFor } from '@/services/workspace-documents';
import { flushIngestion } from '@/services/ingestion';
import { GROWTH_CHANGED_EVENT } from '@/services/growth';
import { disposeChatSession } from '@/services/chat-session';

export interface Workspace extends WorkspaceStores {
  id: string;
  /** id is the content owner (Main or a Working Copy); cruxId is product identity. */
  cruxId: string;
  lifetimeId: string;
  phase: 'loading' | 'ready' | 'error' | 'closing';
  error: string | null;
  seenTurnId: string | null;
  loaded: Promise<void>;
  operations: Set<Promise<unknown>>;
  cleanup: Set<() => void | Promise<void>>;
}
export interface WorkspaceSummary {
  id: string;
  title: string;
  status: string;
  dirty: boolean;
  tending?: TendingState;
}
const sessions = new Map<string, Workspace>();
const KEY = 'cruxgarden:open-workspaces:v1';
export const useWorkspaceRegistry = create<{
  entries: WorkspaceSummary[];
  mru: string[];
  activeId: string | null;
  restored: boolean;
}>(() => ({ entries: [], mru: [], activeId: null, restored: false }));
function persist() {
  const s = useWorkspaceRegistry.getState();
  setSetting(
    KEY,
    JSON.stringify({
      version: 1,
      openCruxIds: s.entries.map((e) => e.id),
      lastActiveCruxId: s.mru[0] ?? null,
    }),
  );
}
export function parseOpenWorkspaces(raw: string | null): { ids: string[]; active: string | null } {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value?.version !== 1 || !Array.isArray(value.openCruxIds)) return { ids: [], active: null };
    const ids = [
      ...new Set<string>(
        value.openCruxIds.filter(
          (id: unknown): id is string => typeof id === 'string' && id.length > 0,
        ),
      ),
    ];
    return { ids, active: ids.includes(value.lastActiveCruxId) ? value.lastActiveCruxId : null };
  } catch {
    return { ids: [], active: null };
  }
}
export function workspaceTending(w: Workspace): TendingState {
  const s = w.data.getState();
  return tendingState({
    copyId: w.id,
    cruxId: w.cruxId,
    lifetimeId: w.lifetimeId,
    phase: w.phase,
    job: s.turnJob,
    streaming: s.isStreaming,
    settling: s.turnSettling,
    queued: s.turnQueue.length,
    seenTurnId: w.seenTurnId ?? getSetting(`cruxgarden:tending-seen:${w.id}`),
    folderMissing: s.folderMissing,
    requests: [
      ...s.pendingDeletes.map((d) => ({
        id: d.id,
        requestedAt: d.requestedAt,
        reason: 'File deletion needs approval',
      })),
      ...w.ui.getState().pendingAgentApprovals.map((a) => ({
        id: a.id,
        requestedAt: a.requestedAt,
        reason: `${a.agent} needs permission`,
      })),
    ],
  });
}
function summarize(w: Workspace) {
  const s = w.data.getState();
  if (
    s.turnJob?.status === 'done' &&
    !s.turnSettling &&
    !s.isStreaming &&
    w.ui.getState().paneVisibility.collaboration &&
    !s.viewingSnapshotId &&
    useWorkspaceRegistry.getState().activeId === w.id &&
    w.seenTurnId !== s.turnJob.id
  ) {
    w.seenTurnId = s.turnJob.id;
    setSetting(`cruxgarden:tending-seen:${w.id}`, s.turnJob.id);
  }
  const tending = workspaceTending(w);
  const next = {
    id: w.id,
    tending,
    title: s.crux?.title || 'Untitled',
    status: `${s.publishPhase ? 'Publishing' : tendingLabel(tending)}${s.turnQueue.length ? ` · ${s.turnQueue.length} queued` : ''}`,
    dirty: w.ui.getState().editor.tabs.some((t) => t.dirty),
  };
  const prev = useWorkspaceRegistry.getState().entries.find((e) => e.id === w.id);
  if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
  useWorkspaceRegistry.setState((r) => ({
    entries: r.entries.some((e) => e.id === w.id)
      ? r.entries.map((e) => (e.id === w.id ? next : e))
      : [...r.entries, next],
  }));
}
export function getWorkspace(id: string): Workspace | undefined {
  return sessions.get(id);
}
export function allWorkspaces(): Workspace[] {
  return [...sessions.values()];
}
export async function openWorkspace(id: string): Promise<Workspace> {
  let w = sessions.get(id);
  if (w) {
    if (w.phase === 'closing') throw new Error('This workspace is closing.');
    await w.loaded;
    return w;
  }
  const ui = createUIStore(id);
  const data = createCruxStore(ui);
  w = {
    id,
    cruxId: id,
    lifetimeId: crypto.randomUUID(),
    data,
    ui,
    phase: 'loading',
    error: null,
    seenTurnId: null,
    loaded: Promise.resolve(),
    operations: new Set(),
    cleanup: new Set(),
  };
  const owned = w;
  workspaceOperations.set(data, owned.operations);
  sessions.set(id, owned);
  owned.cleanup.add(registerPreviewOwner(id));
  owned.cleanup.add(() => setActivePreview(id, null));
  // Track every asynchronous store operation, including work begun from a pane
  // that will unmount. Closing drains these before disposing the session.
  const patch: Partial<CruxState> = {};
  for (const [key, action] of Object.entries(data.getState())) {
    if (typeof action !== 'function' || ['drain', 'reset', 'cancelPendingDeletes'].includes(key))
      continue;
    (patch as Record<string, unknown>)[key] = (...args: unknown[]) => {
      const result = (action as (...a: unknown[]) => unknown)(...args);
      if (result instanceof Promise) {
        owned.operations.add(result);
        void result.finally(() => owned.operations.delete(result)).catch(() => {});
      }
      return result;
    };
  }
  data.setState(patch);
  owned.cleanup.add(data.subscribe(() => summarize(owned)));
  owned.cleanup.add(ui.subscribe(() => summarize(owned)));
  summarize(owned);
  persist();
  owned.loaded = data
    .getState()
    .loadCrux(id)
    .then(() => {
      const copy = data.getState().crux?.meta?.workingCopy as { cruxId?: string } | undefined;
      owned.cruxId = copy?.cruxId ?? id;
      if (data.getState().crux?.kind === 'snapshot')
        throw new Error('A Growth snapshot is not an editable workspace.');
      owned.phase = 'ready';
      owned.cleanup.add(
        maintainNotesManifest(data, (operation) => {
          owned.operations.add(operation);
          void operation.finally(() => owned.operations.delete(operation)).catch(() => {});
        }),
      );
      summarize(owned);
    })
    .catch((error: unknown) => {
      owned.phase = 'error';
      owned.error = (error as Error).message;
      summarize(owned);
      throw error;
    });
  await owned.loaded;
  return owned;
}
let activation = 0;
export async function activateWorkspace(id: string): Promise<Workspace | null> {
  const ticket = ++activation;
  const w = await openWorkspace(id);
  if (ticket !== activation) return null;
  workspaceSelection.setState({ active: w });
  useWorkspaceRegistry.setState((s) => ({
    activeId: id,
    mru: [id, ...s.mru.filter((x) => x !== id)],
  }));
  summarize(w);
  persist();
  return w;
}
export function leaveWorkspaceView() {
  activation++;
  workspaceSelection.setState({ active: null });
  useWorkspaceRegistry.setState({ activeId: null });
}
export async function closeWorkspace(
  id: string,
  options: { stop?: boolean; documents?: 'save' | 'discard' } = {},
): Promise<void> {
  const w = sessions.get(id);
  if (!w) {
    useWorkspaceRegistry.setState((r) => ({
      entries: r.entries.filter((e) => e.id !== id),
      mru: r.mru.filter((x) => x !== id),
    }));
    persist();
    await flushSettings();
    return;
  }
  if (w.phase === 'closing') throw new Error('This workspace is already closing.');
  const s = w.data.getState();
  const busy =
    s.isStreaming ||
    ['running', 'planning', 'checking'].includes(s.turnJob?.status ?? '') ||
    s.pendingDeletes.length ||
    w.ui.getState().pendingAgentApprovals.length;
  if (s.publishPhase || s.uploadProgress)
    throw new Error('Wait for publishing or uploads to finish before closing this workspace.');
  if (busy && !options.stop) throw new Error('Stop the work before closing this workspace.');
  const docs = documentsFor(w.data, w.ui);
  if (docs.hasDirty() && !options.documents)
    throw new Error('Save or discard unsaved edits before closing.');
  w.phase = 'closing';
  w.data.setState({ closing: true });
  summarize(w);
  try {
    w.ui.getState().cancelApprovals();
    w.data.getState().cancelPendingDeletes();
    turnsFor(w.data).stopTurn('closed');
    await w.loaded.catch(() => {});
    await turnsFor(w.data).drain();
    disposeChatSession(id);
    while (w.operations.size) await Promise.all([...w.operations]);
    if (options.documents === 'save') await docs.saveAll();
    await docs.drain();
    await flushIngestion();
    await w.data.getState().drain();
    await w.data.getState().saveMeta();
    await flushSettings();
    disposeChatSession(id);
    for (const fn of w.cleanup) await fn();
    w.ui.getState().dispose();
    w.data.getState().reset();
    docs.dispose();
    sessions.delete(id);
    if (useWorkspaceRegistry.getState().activeId === id) leaveWorkspaceView();
    useWorkspaceRegistry.setState((r) => ({
      entries: r.entries.filter((e) => e.id !== id),
      mru: r.mru.filter((x) => x !== id),
    }));
    persist();
    await flushSettings();
  } catch (error) {
    if (sessions.get(id) !== w) throw error;
    w.phase = 'ready';
    w.data.setState({ closing: false });
    summarize(w);
    throw error;
  }
}
export async function restoreWorkspaceList(): Promise<string | null> {
  if (useWorkspaceRegistry.getState().restored) return null;
  const saved = parseOpenWorkspaces(getSetting(KEY));
  const cruxes = await getServices().crux.listAll();
  const valid = new Map(cruxes.filter((c) => c.kind !== 'snapshot').map((c) => [c.id, c]));
  for (const id of saved.ids) {
    if (valid.has(id)) continue;
    const copy = await findWorkingCopy(id);
    if (copy?.role === 'task' && valid.has(copy.cruxId))
      valid.set(id, await getServices().crux.findById(id));
  }
  const ids = saved.ids.filter((id) => valid.has(id));
  useWorkspaceRegistry.setState({
    restored: true,
    entries: ids.map((id) => ({
      id,
      title: valid.get(id)!.title || 'Untitled',
      status: 'Not loaded',
      dirty: false,
    })),
    mru:
      saved.active && ids.includes(saved.active)
        ? [saved.active, ...ids.filter((id) => id !== saved.active)]
        : ids,
  });
  return saved.active && ids.includes(saved.active) ? saved.active : null;
}
if (typeof window !== 'undefined') {
  window.addEventListener('crux:external-change', (e) => {
    const w = sessions.get((e as CustomEvent<{ cruxId: string }>).detail.cruxId);
    void w?.data.getState().refreshArtifacts().catch(console.error);
  });
  window.addEventListener('crux:folder-missing', (e) => {
    sessions
      .get((e as CustomEvent<{ cruxId: string }>).detail.cruxId)
      ?.data.setState({ folderMissing: true });
  });
  window.addEventListener(GROWTH_CHANGED_EVENT, (e) => {
    const id = (e as CustomEvent<{ cruxId?: string }>).detail?.cruxId;
    for (const w of sessions.values())
      if (!id || id === w.id) void w.data.getState().loadGrowths().catch(console.error);
  });
}

/** Orderly application exit preserves membership but never resumes provider calls. */
export async function shutdownWorkspaces(documents: 'save' | 'discard'): Promise<void> {
  const state = useWorkspaceRegistry.getState();
  const saved = {
    version: 1,
    openCruxIds: state.entries.map((e) => e.id),
    lastActiveCruxId: state.mru[0] ?? null,
  };
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents });
  setSetting(KEY, JSON.stringify(saved));
  await flushSettings();
}
/** Garden replacement must never inherit callbacks or open sessions from the old database. */
export async function prepareGardenReplacement(): Promise<void> {
  if (allWorkspaces().length)
    throw new Error('Close all open Crux workspaces before replacing this garden.');
  leaveWorkspaceView();
  useWorkspaceRegistry.setState({ entries: [], mru: [], activeId: null, restored: false });
  await flushSettings();
}

/** Close a Crux as a group, preserving each copy's independent state and directories. */
export async function closeCruxWorkspaces(
  cruxId: string,
  documents: 'save' | 'discard',
): Promise<void> {
  const ids: string[] = [];
  for (const entry of useWorkspaceRegistry.getState().entries) {
    if (entry.id === cruxId || (await findWorkingCopy(entry.id))?.cruxId === cruxId)
      ids.push(entry.id);
  }
  for (const id of ids) {
    const s = getWorkspace(id)?.data.getState();
    if (s?.closing || s?.publishPhase || s?.uploadProgress)
      throw new Error('Wait for this Crux’s task operations to finish before closing.');
  }
  for (const id of ids) await closeWorkspace(id, { stop: true, documents });
}
