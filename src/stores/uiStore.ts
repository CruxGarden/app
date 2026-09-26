import { buildMosaicTree, addPaneToMosaic } from '@/lib/mosaic-layout';
import { deferNotebookAction } from '@/services/notebook-lifecycle';
import { leaveSurface } from '@/components/plasma/leave';
import { create, useStore } from 'zustand';
import { useContext } from 'react';
import { WorkspaceContext, gardenWorkspace, workspaceSelection } from './workspaceSelection';
import type { StoreApi } from 'zustand';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import type { MosaicNode } from 'react-mosaic-component';

// ── Agent approvals (ADR 0013) ──────────────────────────

export interface AgentApproval {
  id: string;
  requestedAt: string;
  /** Who is asking — an MCP client name, or "Claude Code" for the Agent Provider */
  agent: string;
  /** `tool`: the Agent Provider wants to run a tool the SDK will not auto-allow (ADR 0019) */
  action: 'publish' | 'unpublish' | 'tool';
  cruxId: string;
  /** For `tool`: the tool's name and a one-line summary (the command, the url…) */
  tool?: string;
  detail?: string;
  /**
   * For `tool`: the complete arguments, so the person can read the whole
   * command or code before allowing it. The banner shows `detail` and opens
   * this on request; a truncated one-liner was the only review available
   * during the live Penpot sessions (UI-POLISH-PLAN, 2026-09-15).
   */
  input?: Record<string, unknown>;
}

// ── Pane Types ──────────────────────────────────────────

export type PaneType =
  | 'tasks'
  | 'history'
  | 'collaboration'
  | 'artifacts'
  | 'workshop'
  | 'details'
  | 'sync'
  | 'publish'
  | 'export'
  | 'store'
  | 'media'
  | 'mood'
  | 'synth'
  | 'browser'
  | 'settings'
  | 'explore'
  | 'home'
  | 'console'
  | 'navigator';

/** Rainbow gradient colors for each pane — reads from CSS custom properties set by the palette system */
export const PANE_COLORS: Record<PaneType, string> = {
  tasks: 'var(--pane-tasks)',
  collaboration: 'var(--pane-collaboration)',
  artifacts: 'var(--pane-artifacts)',
  workshop: 'var(--pane-workshop)',
  details: 'var(--pane-details)',
  history: 'var(--pane-history)',
  export: 'var(--pane-export)',
  sync: 'var(--pane-sync)',
  publish: 'var(--pane-publish)',
  store: 'var(--pane-store)',
  media: 'var(--pane-media)',
  mood: 'var(--pane-mood)',
  synth: 'var(--pane-synth)',
  browser: 'var(--pane-browser)',
  settings: 'var(--pane-settings)',
  explore: 'var(--pane-explore)',
  home: 'var(--pane-workshop)',
  console: 'var(--pane-collaboration)',
  navigator: 'var(--pane-artifacts)',
};

export type EditorViewMode = 'source' | 'preview' | 'form';

export interface EditorTab {
  id: string; // artifact ID
  path: string; // file path (from meta.path or filename)
  name: string; // display name (last segment)
  dirty: boolean;
  viewMode: EditorViewMode;
  scrollTop: number;
}

export interface EditorPaneState {
  tabs: EditorTab[];
  activeTabId: string | null;
  diffTargetId: string | null;
}

export interface FileOperation {
  type: 'create-file' | 'create-folder' | 'rename' | 'delete';
  targetPath?: string;
  parentPath?: string;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetId: string | null;
  targetPath: string;
  isFolder: boolean;
  selectedIds: string[];
}

// ── Full UI State ───────────────────────────────────────

export interface UIState {
  composerDraft: string;
  composerHistoryIndex: number;
  composerHistoryDraft: string;
  setComposerDraft: (value: string) => void;
  cancelApprovals: () => void;
  dispose: () => void;
  // Pane system
  paneOrder: PaneType[];
  paneVisibility: Record<PaneType, boolean>;
  mosaicLayout: MosaicNode<PaneType> | null;
  activeCruxId: string | null;

  // Editor
  editor: EditorPaneState;
  workshopView: 'clean' | 'advanced';
  setWorkshopView: (view: 'clean' | 'advanced') => void;

  // File operations
  activeFileOperation: FileOperation | null;

  // Context menu
  contextMenu: ContextMenuState;

  // Folder open/close state (persisted per crux)
  folderOpenState: Record<string, boolean>;

  // Mobile
  mobileActivePane: PaneType;

  // AI Tools
  aiEnabled: boolean;
  setAiEnabled: (enabled: boolean) => void;

  // Console

  // Settings modal
  setSettingsOpen: (open: boolean) => void;

  // Agent approvals (ADR 0013): an external agent asked for something that
  // needs a human yes — publish/unpublish. The tool call awaits the answer;
  // ChatPane renders the banner. Same contract as delete approvals: every
  // waiter must settle or the agent's call hangs forever.
  pendingAgentApprovals: AgentApproval[];
  requestAgentApproval: (
    req: Omit<AgentApproval, 'id' | 'requestedAt'>,
    signal?: AbortSignal,
  ) => Promise<boolean>;
  resolveAgentApproval: (id: string, approved: boolean) => void;

  // Explore modal
  setExploreOpen: (open: boolean) => void;
  /** Kind filter Explore opens with (e.g. 'mood'); consumed on mount */
  exploreKind: string | null;
  openExplore: (kind?: string | null) => void;

  // Mood modal (quick presets/background/persona; opens the Mood Builder page)
  setMoodPanelOpen: (open: boolean) => void;
  toggleMoodPanel: () => void;
  /** Pixels the Mood Bar reserves at the bottom of <main> so it never covers pane controls. */
  dockReserve: number;
  setDockReserve: (px: number) => void;

  // ── Layout actions ──

  /** Start a new Crux with Collaboration beside its clean preview. */
  seedCruxLayout: (cruxId: string, collaborationPercent?: number) => void;
  /** Which panes this workspace offers: a Crux's, or a Garden Home's. */
  workspaceScope: WorkspaceScope;
  setActiveCrux: (id: string | null) => void;
  togglePane: (pane: PaneType) => void;
  setPaneVisible: (pane: PaneType, visible: boolean) => void;
  reorderPanes: (newOrder: PaneType[]) => void;
  setMosaicLayout: (
    layout: MosaicNode<PaneType> | null,
    options?: { persistImmediately?: boolean },
  ) => void;

  // ── Editor tab actions ──
  openFile: (id: string, path: string, options?: { preserveWorkshopView?: boolean }) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  setTabDirty: (id: string, dirty: boolean) => void;
  setTabViewMode: (id: string, mode: EditorViewMode) => void;
  setTabScrollTop: (id: string, scrollTop: number) => void;
  setDiffTarget: (id: string | null) => void;
  closeAllTabs: () => void;

  // ── Folder state ──
  setFolderOpen: (folderId: string, isOpen: boolean) => void;

  // ── File operations ──
  startFileOperation: (op: FileOperation) => void;
  cancelFileOperation: () => void;

  // ── Context menu ──
  showContextMenu: (state: Omit<ContextMenuState, 'visible'>) => void;
  hideContextMenu: () => void;

  // ── Mobile ──
  setMobileActivePane: (pane: PaneType) => void;

  // ── Keeper Console ──
  setConsoleOpen: (open: boolean) => void;
  toggleConsole: () => void;

  // ── Mood Editor ──
}

// ── Helpers ─────────────────────────────────────────────

function nameFromPath(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] || path;
}

/** The panes a Crux workspace offers. */
export const DEFAULT_PANE_ORDER: PaneType[] = [
  'navigator',
  'tasks',
  'collaboration',
  'console',
  'artifacts',
  'workshop',
  'details',
  'history',
  'export',
  'sync',
  'publish',
  'store',
  'media',
  'mood',
  'synth',
  'browser',
  'settings',
  'explore',
];
const DEFAULT_VISIBILITY: Record<PaneType, boolean> = {
  // Tasks is a pane like any other (Daniel, 2026-09-19): on by default.
  tasks: true,
  history: false,
  collaboration: true,
  artifacts: false,
  workshop: false,
  details: false,
  sync: false,
  publish: false,
  export: false,
  store: false,
  media: false,
  mood: false,
  synth: false,
  browser: false,
  settings: false,
  explore: false,
  home: false,
  console: false,
  navigator: false,
};

/** The panes a Garden Home workspace offers: its Home, the Garden's Collaboration, and the Garden-wide panels. */
export const GARDEN_PANE_ORDER: PaneType[] = [
  'navigator',
  'home',
  'console',
  'mood',
  'synth',
  'browser',
  'settings',
  'explore',
];
const GARDEN_VISIBILITY: Record<PaneType, boolean> = {
  ...DEFAULT_VISIBILITY,
  tasks: false,
  collaboration: false,
  home: true,
};
export type WorkspaceScope = 'crux' | 'garden';
const scopeOrder = (scope: WorkspaceScope) =>
  scope === 'garden' ? GARDEN_PANE_ORDER : DEFAULT_PANE_ORDER;
const scopeDefaults = (scope: WorkspaceScope) =>
  scope === 'garden' ? GARDEN_VISIBILITY : DEFAULT_VISIBILITY;

/** Garden-wide panes open as a full-height column on the right, beside the work. */
const SIDE_PANES = new Set<PaneType>(['mood', 'settings', 'explore', 'console']);
/**
 * Where a newly opened pane goes: the Navigator docks left, Garden-wide panes
 * dock right, anything else shares the largest tile. All stay resizable.
 */
function addPane(tree: MosaicNode<PaneType> | null, pane: PaneType): MosaicNode<PaneType> {
  if (tree === null) return pane;
  if (getMosaicLeaves(tree).includes(pane)) return tree;
  const sideOnly = (node: MosaicNode<PaneType>) =>
    getMosaicLeaves(node).every((leaf) => SIDE_PANES.has(leaf));
  if (pane === 'navigator') {
    // Dock beside the work, inside any right-hand column, at a fifth of the width.
    const dock = (node: MosaicNode<PaneType>, share: number): MosaicNode<PaneType> =>
      typeof node !== 'string' && node.direction === 'row' && sideOnly(node.second)
        ? { ...node, first: dock(node.first, (share * (node.splitPercentage ?? 50)) / 100) }
        : {
            direction: 'row',
            first: 'navigator',
            second: node,
            splitPercentage: Math.min(45, 20 / share),
          };
    return dock(tree, 1);
  }
  if (SIDE_PANES.has(pane)) {
    // Garden-wide panes share one right-hand column, about a third wide, stacked.
    const side = (node: MosaicNode<PaneType>, share: number): MosaicNode<PaneType> => {
      if (typeof node !== 'string' && node.direction === 'row') {
        if (node.first === 'navigator')
          return {
            ...node,
            second: side(node.second, (share * (100 - (node.splitPercentage ?? 50))) / 100),
          };
        if (sideOnly(node.second))
          return {
            ...node,
            second: { direction: 'column', first: node.second, second: pane, splitPercentage: 50 },
          };
      }
      return {
        direction: 'row',
        first: node,
        second: pane,
        splitPercentage: 100 - Math.min(60, 32 / share),
      };
    };
    return side(tree, 1);
  }
  return addPaneToMosaic(tree, pane);
}

// ── Mosaic layout helpers ────────────────────────────────

/** Get all leaf pane types from a mosaic tree */
export function getMosaicLeaves(node: MosaicNode<PaneType> | null): PaneType[] {
  if (node === null) return [];
  if (typeof node === 'string') return [node];
  return [...getMosaicLeaves(node.first), ...getMosaicLeaves(node.second)];
}

/** Remove a pane from a mosaic tree */
function removePaneFromMosaic(
  node: MosaicNode<PaneType>,
  pane: PaneType,
): MosaicNode<PaneType> | null {
  if (typeof node === 'string') {
    return node === pane ? null : node;
  }
  const first = removePaneFromMosaic(node.first, pane);
  const second = removePaneFromMosaic(node.second, pane);
  if (first === null && second === null) return null;
  if (first === null) return second;
  if (second === null) return first;
  return { ...node, first, second };
}

const DEFAULT_CONTEXT_MENU: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  targetId: null,
  targetPath: '',
  isFolder: false,
  selectedIds: [],
};

// ── Layout persistence ──────────────────────────────────

interface PersistedLayout {
  paneOrder: string[];
  paneVisibility: Record<string, boolean>;
  mosaicLayout?: MosaicNode<string> | null;
}

const GLOBAL_LAYOUT_KEY = SettingsKey.GlobalLayout;
// Every task's workspace has its own view (Daniel, 2026-09-19): its own
// layout, the Tasks pane open by default because that is where tasks are
// made and managed; closing it there is the person's choice.
const cruxLayoutKey = (id: string) => `cruxgarden:layout:${id}`;
export const gardenLayoutKey = (id: string) => `cruxgarden:garden-layout:${id}`;
const editorTabsKey = (id: string) => `cruxgarden:editor-tabs:${id}`;
const folderStateKey = (id: string) => `cruxgarden:folder-state:${id}`;

interface PersistedEditorTab {
  id: string;
  path: string;
  viewMode?: EditorViewMode;
  scrollTop?: number;
}

interface PersistedEditorTabs {
  tabs: PersistedEditorTab[];
  activeTabId: string | null;
}

function loadEditorTabs(cruxId: string): PersistedEditorTabs | null {
  try {
    const raw = getSetting(editorTabsKey(cruxId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveEditorTabs(cruxId: string, editor: EditorPaneState) {
  const data: PersistedEditorTabs = {
    tabs: editor.tabs.map((t) => ({
      id: t.id,
      path: t.path,
      viewMode: t.viewMode,
      scrollTop: t.scrollTop,
    })),
    activeTabId: editor.activeTabId,
  };
  setSetting(editorTabsKey(cruxId), JSON.stringify(data));
}

function loadFolderState(cruxId: string): Record<string, boolean> | null {
  try {
    const raw = getSetting(folderStateKey(cruxId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveFolderState(cruxId: string, state: Record<string, boolean>) {
  setSetting(folderStateKey(cruxId), JSON.stringify(state));
}

/** Map old pane type names to current names */
const RENAME_MAP: Record<string, PaneType> = {
  navigation: 'history',
  chat: 'collaboration',
  editor: 'workshop',
  metadata: 'details',
};

/** Rename pane types in a mosaic tree */
function renameMosaicPanes(node: MosaicNode<string>): MosaicNode<string> {
  if (typeof node === 'string') return RENAME_MAP[node] ?? node;
  return {
    ...node,
    first: renameMosaicPanes(node.first),
    second: renameMosaicPanes(node.second),
  };
}

/** Remove unknown pane types from a mosaic tree */
function filterMosaicPanes(
  node: MosaicNode<string>,
  valid: Set<string>,
): MosaicNode<string> | null {
  if (typeof node === 'string') return valid.has(node) ? node : null;
  const first = filterMosaicPanes(node.first, valid);
  const second = filterMosaicPanes(node.second, valid);
  if (first === null && second === null) return null;
  if (first === null) return second;
  if (second === null) return first;
  return { ...node, first, second };
}

interface ValidatedLayout {
  paneOrder: PaneType[];
  paneVisibility: Record<PaneType, boolean>;
  mosaicLayout: MosaicNode<PaneType> | null;
}

/** Validate and migrate a persisted layout to match current PaneType values */
function validateLayout(layout: PersistedLayout, scope: WorkspaceScope = 'crux'): ValidatedLayout {
  const order = scopeOrder(scope);
  const defaults = scopeDefaults(scope);
  const allPanes = new Set<PaneType>(order);

  // Rename old pane types in order
  const renamedOrder = layout.paneOrder.map((p) => RENAME_MAP[p] ?? p) as PaneType[];
  // Rename old pane types in visibility
  const renamedVisibility: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(layout.paneVisibility)) {
    renamedVisibility[RENAME_MAP[key] ?? key] = value;
  }

  // Keep only known panes, preserving user order
  const validOrder = renamedOrder.filter((p) => allPanes.has(p));

  // Append any missing panes at the end
  for (const pane of order) {
    if (!validOrder.includes(pane)) {
      validOrder.push(pane);
    }
  }

  // Build visibility with defaults for missing entries
  const validVisibility = {} as Record<PaneType, boolean>;
  for (const pane of DEFAULT_PANE_ORDER.concat(GARDEN_PANE_ORDER)) {
    validVisibility[pane] = allPanes.has(pane)
      ? (renamedVisibility[pane] ?? defaults[pane])
      : false;
  }

  // Restore or build mosaic layout
  let mosaicLayout: MosaicNode<PaneType> | null = null;
  if (layout.mosaicLayout) {
    // Migrate saved mosaic tree: rename panes, remove unknown ones
    const renamed = renameMosaicPanes(layout.mosaicLayout);
    mosaicLayout = filterMosaicPanes(
      renamed,
      allPanes as Set<string>,
    ) as MosaicNode<PaneType> | null;
  }
  if (!mosaicLayout) {
    // Build from visible panes in order
    const visiblePanes = validOrder.filter((p) => validVisibility[p]);
    mosaicLayout = buildMosaicTree(visiblePanes);
  } else {
    // A pane that is visible but not in the saved tree (a pane added since
    // the layout was saved — the tasks pane, for a garden from before it
    // existed) joins the tree where a fresh one would put it.
    const leaves = new Set(getMosaicLeaves(mosaicLayout));
    for (const pane of validOrder)
      if (validVisibility[pane] && !leaves.has(pane)) mosaicLayout = addPane(mosaicLayout, pane);
  }

  return { paneOrder: validOrder, paneVisibility: validVisibility, mosaicLayout };
}

function loadLayout(key: string): PersistedLayout | null {
  try {
    const raw = getSetting(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLayout(
  key: string,
  layout: {
    paneOrder: PaneType[];
    paneVisibility: Record<PaneType, boolean>;
    mosaicLayout?: MosaicNode<PaneType> | null;
  },
) {
  setSetting(key, JSON.stringify(layout));
}

export function createUIStore(cruxId?: string, scope: WorkspaceScope = 'crux') {
  const order = scopeOrder(scope);
  // A Garden's own arrangement never shares a key with a Crux workspace of the same id.
  const layoutKey = (id: string) => (scope === 'garden' ? gardenLayoutKey(id) : cruxLayoutKey(id));
  const defaults = scopeDefaults(scope);
  const fresh = (): ValidatedLayout => {
    const visiblePanes = order.filter((p) => defaults[p]);
    return {
      paneOrder: [...order],
      paneVisibility: { ...defaults },
      mosaicLayout: buildMosaicTree(visiblePanes),
    };
  };
  const agentApprovalResolvers = new Map<string, (approved: boolean) => void>();
  /** Debounced layout persistence — avoids writes on every resize frame */
  let _saveTimer: ReturnType<typeof setTimeout> | null = null;
  function debouncedSaveLayout(getState: () => UIState) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      const s = getState();
      const layout = {
        paneOrder: s.paneOrder,
        paneVisibility: s.paneVisibility,
        mosaicLayout: s.mosaicLayout,
      };
      saveLayout(s.activeCruxId ? layoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
    }, 300);
  }

  /** Load global layout, migrating from old Zustand persist key if needed */
  function getInitialLayout(): ValidatedLayout {
    if (scope === 'garden') return fresh();
    const global = loadLayout(GLOBAL_LAYOUT_KEY);
    if (global) return validateLayout(global);

    // Migrate from old persist key (cruxgarden:ui)
    try {
      const old = getSetting(SettingsKey.LegacyUi);
      if (old) {
        const parsed = JSON.parse(old);
        if (parsed.state?.paneOrder) {
          const migrated = validateLayout({
            paneOrder: parsed.state.paneOrder,
            paneVisibility: parsed.state.paneVisibility,
          });
          saveLayout(GLOBAL_LAYOUT_KEY, migrated);
          return migrated;
        }
      }
    } catch {
      /* ignore */
    }

    const visiblePanes = DEFAULT_PANE_ORDER.filter((p) => DEFAULT_VISIBILITY[p]);
    return {
      paneOrder: [...DEFAULT_PANE_ORDER],
      paneVisibility: { ...DEFAULT_VISIBILITY },
      mosaicLayout: buildMosaicTree(visiblePanes),
    };
  }

  /** Resolve layout for a crux: crux-specific → global → defaults */
  function resolveLayout(cruxId: string): ValidatedLayout {
    const cruxLayout = loadLayout(layoutKey(cruxId));
    if (cruxLayout) return validateLayout(cruxLayout, scope);
    if (scope === 'garden') return fresh();

    const globalLayout = loadLayout(GLOBAL_LAYOUT_KEY);
    if (globalLayout) return validateLayout(globalLayout);

    const visiblePanes = DEFAULT_PANE_ORDER.filter((p) => DEFAULT_VISIBILITY[p]);
    return {
      paneOrder: [...DEFAULT_PANE_ORDER],
      paneVisibility: { ...DEFAULT_VISIBILITY },
      mosaicLayout: buildMosaicTree(visiblePanes),
    };
  }

  /** Debounced save for scroll position updates (avoid thrashing localStorage) */
  let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
  function debouncedSaveEditorTabs(cruxId: string, editor: EditorPaneState) {
    if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(() => {
      saveEditorTabs(cruxId, editor);
    }, 500);
  }

  const initialLayout = getInitialLayout();

  // ── Store ───────────────────────────────────────────────

  const store = create<UIState>()((set, get) => ({
    workspaceScope: scope,
    composerHistoryIndex: -1,
    composerHistoryDraft: '',
    composerDraft: cruxId ? (getSetting(`cruxgarden:composer:${cruxId}`) ?? '') : '',
    setComposerDraft: (composerDraft) => {
      set({ composerDraft });
      if (cruxId) setSetting(`cruxgarden:composer:${cruxId}`, composerDraft);
    },
    cancelApprovals: () => {
      for (const resolve of agentApprovalResolvers.values()) resolve(false);
      agentApprovalResolvers.clear();
      set({ pendingAgentApprovals: [] });
    },
    dispose: () => {
      get().cancelApprovals();
      if (_saveTimer) {
        clearTimeout(_saveTimer);
        const s = get();
        saveLayout(s.activeCruxId ? layoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, {
          paneOrder: s.paneOrder,
          paneVisibility: s.paneVisibility,
          mosaicLayout: s.mosaicLayout,
        });
      }
      if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
      const s = get();
      if (s.activeCruxId) saveEditorTabs(s.activeCruxId, s.editor);
    },
    // ── Initial state ──
    paneOrder: initialLayout.paneOrder,
    paneVisibility: initialLayout.paneVisibility,
    mosaicLayout: initialLayout.mosaicLayout,
    activeCruxId: null,

    workshopView: 'clean',
    setWorkshopView: (workshopView) => {
      if (deferNotebookAction(get().activeCruxId, () => get().setWorkshopView(workshopView)))
        return;
      set({ workshopView });
      const id = get().activeCruxId;
      if (id) setSetting(`cruxgarden:workshop-view:${id}`, workshopView);
    },
    editor: {
      tabs: [],
      activeTabId: null,
      diffTargetId: null,
    },

    activeFileOperation: null,
    folderOpenState: {},
    contextMenu: { ...DEFAULT_CONTEXT_MENU },
    mobileActivePane: (scope === 'garden' ? 'home' : 'collaboration') as PaneType,
    aiEnabled: false,
    setAiEnabled: (enabled) => set({ aiEnabled: enabled }),
    // Garden-wide panels are panes of the workspace on screen (Daniel, 2026-09-25).
    setSettingsOpen: (open) => currentWorkspaceUI().getState().setPaneVisible('settings', open),
    pendingAgentApprovals: [],
    requestAgentApproval: (req, signal) =>
      new Promise<boolean>((resolve) => {
        if (signal?.aborted) {
          resolve(false);
          return;
        }
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const abort = () => get().resolveAgentApproval(id, false);
        agentApprovalResolvers.set(id, (allow) => {
          signal?.removeEventListener('abort', abort);
          resolve(allow);
        });
        signal?.addEventListener('abort', abort, { once: true });
        set((s) => ({
          pendingAgentApprovals: [
            ...s.pendingAgentApprovals,
            { ...req, id, requestedAt: new Date().toISOString() },
          ],
        }));
      }),
    resolveAgentApproval: (id, approved) => {
      set((s) => ({ pendingAgentApprovals: s.pendingAgentApprovals.filter((a) => a.id !== id) }));
      const resolve = agentApprovalResolvers.get(id);
      if (!resolve) return;
      agentApprovalResolvers.delete(id);
      resolve(approved);
    },
    setExploreOpen: (open) => currentWorkspaceUI().getState().setPaneVisible('explore', open),
    exploreKind: null,
    openExplore: (kind = null) => {
      useUIStore.setState({ exploreKind: kind });
      currentWorkspaceUI().getState().setPaneVisible('explore', true);
    },

    // ── Layout actions ──

    seedCruxLayout: (cruxId, collaborationPercent) => {
      const visibility: Record<string, boolean> = {};
      for (const pane of DEFAULT_PANE_ORDER) visibility[pane] = false;
      // Creation starts with a conversation and the result beside it. Template
      // Builder actions remain available in Advanced; no provider-specific guess.
      visibility.collaboration = true;
      visibility.workshop = true;
      // Tasks is a pane like any other (Daniel, 2026-09-19): on by default,
      // beside the rest, dragged wherever it is wanted or closed.
      visibility.tasks = DEFAULT_VISIBILITY.tasks;
      setSetting(
        layoutKey(cruxId),
        JSON.stringify({
          paneOrder: DEFAULT_PANE_ORDER,
          paneVisibility: visibility,
          // Tasks stands as a narrow column on the left — a pane like any
          // other, to be dragged elsewhere or closed — beside the conversation
          // and the result.
          mosaicLayout: {
            direction: 'row',
            first: 'tasks',
            second: {
              direction: 'row',
              first: 'collaboration',
              second: 'workshop',
              splitPercentage: collaborationPercent ?? 50,
            },
            splitPercentage: 20,
          },
        }),
      );
    },
    setMoodPanelOpen: (open) => currentWorkspaceUI().getState().setPaneVisible('mood', open),
    toggleMoodPanel: () => currentWorkspaceUI().getState().togglePane('mood'),
    dockReserve: 0,
    setDockReserve: (px) => set((s) => (s.dockReserve === px ? s : { dockReserve: px })),

    setActiveCrux: (id) => {
      // Flush any pending debounced scroll save
      if (scrollSaveTimer) {
        clearTimeout(scrollSaveTimer);
        scrollSaveTimer = null;
      }
      // Save current state before switching
      const prev = get();
      if (prev.activeCruxId) {
        if (prev.editor.tabs.length > 0) {
          saveEditorTabs(prev.activeCruxId, prev.editor);
        }
        if (Object.keys(prev.folderOpenState).length > 0) {
          saveFolderState(prev.activeCruxId, prev.folderOpenState);
        }
      }

      if (id) {
        const layout = resolveLayout(id);
        // Restore editor tabs for this crux
        const saved = loadEditorTabs(id);
        const restoredTabs: EditorTab[] = saved
          ? saved.tabs.map((t) => ({
              id: t.id,
              path: t.path,
              name: nameFromPath(t.path),
              dirty: false,
              viewMode: t.viewMode ?? 'source',
              scrollTop: t.scrollTop ?? 0,
            }))
          : [];
        const restoredActiveId = saved?.activeTabId ?? null;

        // Restore folder open/close state
        const savedFolders = loadFolderState(id);

        set({
          activeCruxId: id,
          workshopView:
            getSetting(`cruxgarden:workshop-view:${id}`) === 'advanced' ? 'advanced' : 'clean',
          paneOrder: layout.paneOrder,
          paneVisibility: layout.paneVisibility,
          mosaicLayout: layout.mosaicLayout,
          editor: {
            tabs: restoredTabs,
            activeTabId: restoredActiveId,
            diffTargetId: null,
          },
          folderOpenState: savedFolders ?? {},
        });
      } else {
        const global = loadLayout(GLOBAL_LAYOUT_KEY);
        const layout = global ? validateLayout(global) : getInitialLayout();
        set({
          activeCruxId: null,
          paneOrder: layout.paneOrder,
          paneVisibility: layout.paneVisibility,
          mosaicLayout: layout.mosaicLayout,
          editor: { tabs: [], activeTabId: null, diffTargetId: null },
          folderOpenState: {},
        });
      }
    },

    togglePane: (pane) => {
      if (!order.includes(pane)) return;
      if (deferNotebookAction(get().activeCruxId, () => get().togglePane(pane))) return;
      const apply = () => {
        const prev = get();
        const wasVisible = prev.paneVisibility[pane];
        const newVisibility = { ...prev.paneVisibility, [pane]: !wasVisible };

        // Update mosaic tree: add or remove the pane
        let newMosaic: MosaicNode<PaneType> | null;
        if (!wasVisible) {
          newMosaic = addPane(prev.mosaicLayout, pane);
        } else {
          newMosaic = prev.mosaicLayout ? removePaneFromMosaic(prev.mosaicLayout, pane) : null;
        }

        // Derive pane order from the mosaic tree leaves
        const newOrder = newMosaic ? getMosaicLeaves(newMosaic) : prev.paneOrder;

        set({
          paneVisibility: newVisibility,
          paneOrder: newOrder,
          mosaicLayout: newMosaic,
          // Opening a pane shows it, including in the one-pane narrow layout.
          ...(!wasVisible ? { mobileActivePane: pane } : {}),
        });
        const s = get();
        const layout = {
          paneOrder: s.paneOrder,
          paneVisibility: s.paneVisibility,
          mosaicLayout: s.mosaicLayout,
        };
        saveLayout(s.activeCruxId ? layoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
      };
      // A pane closing under Plasma fades its contents first, then leaves.
      if (get().paneVisibility[pane]) leaveSurface(`.mosaic-window.pane-${pane}`, apply);
      else apply();
    },

    setPaneVisible: (pane, visible) => {
      if (!order.includes(pane)) return;
      if (deferNotebookAction(get().activeCruxId, () => get().setPaneVisible(pane, visible)))
        return;
      const prev = get();
      let newMosaic = prev.mosaicLayout;
      if (visible && !prev.paneVisibility[pane]) {
        newMosaic = addPane(newMosaic, pane);
      } else if (!visible && prev.paneVisibility[pane]) {
        newMosaic = newMosaic ? removePaneFromMosaic(newMosaic, pane) : null;
      }
      const newOrder = newMosaic ? getMosaicLeaves(newMosaic) : prev.paneOrder;
      set({
        paneVisibility: { ...prev.paneVisibility, [pane]: visible },
        mosaicLayout: newMosaic,
        paneOrder: newOrder,
        ...(visible ? { mobileActivePane: pane } : {}),
      });
      const s = get();
      const layout = {
        paneOrder: s.paneOrder,
        paneVisibility: s.paneVisibility,
        mosaicLayout: s.mosaicLayout,
      };
      saveLayout(s.activeCruxId ? layoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
    },

    reorderPanes: (newOrder) => {
      set({ paneOrder: newOrder });
      const s = get();
      const layout = {
        paneOrder: s.paneOrder,
        paneVisibility: s.paneVisibility,
        mosaicLayout: s.mosaicLayout,
      };
      saveLayout(s.activeCruxId ? layoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
    },

    setMosaicLayout: (newLayout, options) => {
      const prev = get();
      // Fast path: if leaves haven't changed (resize only), just update the tree
      const prevLeaves = getMosaicLeaves(prev.mosaicLayout);
      const newLeaves = getMosaicLeaves(newLayout);
      const leavesChanged =
        prevLeaves.length !== newLeaves.length || prevLeaves.some((l, i) => l !== newLeaves[i]);

      if (leavesChanged) {
        // Leaves changed (pane added/removed) — full sync
        const newVisibility = { ...prev.paneVisibility };
        const leafSet = new Set(newLeaves);
        for (const pane of DEFAULT_PANE_ORDER) {
          newVisibility[pane] = leafSet.has(pane);
        }
        set({ mosaicLayout: newLayout, paneVisibility: newVisibility, paneOrder: newLeaves });
      } else {
        // Resize only — just update the tree, skip visibility/order
        set({ mosaicLayout: newLayout });
      }

      // Drag frames are debounced; applying a named arrangement is an explicit save.
      if (options?.persistImmediately) {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = null;
        const s = get();
        saveLayout(s.activeCruxId ? layoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, {
          paneOrder: s.paneOrder,
          paneVisibility: s.paneVisibility,
          mosaicLayout: s.mosaicLayout,
        });
      } else debouncedSaveLayout(get);
    },

    // ── Editor tab actions ──

    openFile: (id, path, options) => {
      if (deferNotebookAction(get().activeCruxId, () => get().openFile(id, path, options))) return;
      if (!options?.preserveWorkshopView) get().setWorkshopView('advanced');
      set((s) => {
        const existing = s.editor.tabs.find((t) => t.id === id);
        if (existing) {
          return { editor: { ...s.editor, activeTabId: id } };
        }
        // Same path, new artifact id (a snapshot viewed, a revert, a branch):
        // the tab is the same tab — re-point it rather than opening a twin.
        const samePath = s.editor.tabs.find((t) => t.path === path);
        if (samePath) {
          return {
            editor: {
              ...s.editor,
              tabs: s.editor.tabs.map((t) => (t === samePath ? { ...t, id, dirty: false } : t)),
              activeTabId: id,
            },
          };
        }
        const tab: EditorTab = {
          id,
          path,
          name: nameFromPath(path),
          dirty: false,
          viewMode: 'source',
          scrollTop: 0,
        };
        return {
          editor: {
            ...s.editor,
            tabs: [...s.editor.tabs, tab],
            activeTabId: id,
          },
        };
      });
      const s = get();
      if (s.activeCruxId) saveEditorTabs(s.activeCruxId, s.editor);
    },

    closeTab: (id) => {
      set((s) => {
        const tabs = s.editor.tabs.filter((t) => t.id !== id);
        let activeTabId = s.editor.activeTabId;
        if (activeTabId === id) {
          const closedIndex = s.editor.tabs.findIndex((t) => t.id === id);
          activeTabId = tabs[Math.min(closedIndex, tabs.length - 1)]?.id ?? null;
        }
        return { editor: { ...s.editor, tabs, activeTabId } };
      });
      const s = get();
      if (s.activeCruxId) saveEditorTabs(s.activeCruxId, s.editor);
    },

    setActiveTab: (id) => {
      if (deferNotebookAction(get().activeCruxId, () => get().setActiveTab(id))) return;
      set((s) => ({ editor: { ...s.editor, activeTabId: id } }));
      const s = get();
      if (s.activeCruxId) saveEditorTabs(s.activeCruxId, s.editor);
    },

    setTabDirty: (id, dirty) =>
      set((s) => ({
        editor: {
          ...s.editor,
          tabs: s.editor.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)),
        },
      })),

    setTabViewMode: (id, mode) => {
      set((s) => ({
        editor: {
          ...s.editor,
          tabs: s.editor.tabs.map((t) => (t.id === id ? { ...t, viewMode: mode } : t)),
        },
      }));
      const s = get();
      if (s.activeCruxId) saveEditorTabs(s.activeCruxId, s.editor);
    },

    setTabScrollTop: (id, scrollTop) => {
      set((s) => ({
        editor: {
          ...s.editor,
          tabs: s.editor.tabs.map((t) => (t.id === id ? { ...t, scrollTop } : t)),
        },
      }));
      const s = get();
      if (s.activeCruxId) debouncedSaveEditorTabs(s.activeCruxId, s.editor);
    },

    setDiffTarget: (id) => set((s) => ({ editor: { ...s.editor, diffTargetId: id } })),

    closeAllTabs: () => {
      set((s) => ({
        editor: { ...s.editor, tabs: [], activeTabId: null, diffTargetId: null },
      }));
      const s = get();
      if (s.activeCruxId) saveEditorTabs(s.activeCruxId, s.editor);
    },

    // ── Folder state ──

    setFolderOpen: (folderId, isOpen) => {
      set((s) => ({
        folderOpenState: { ...s.folderOpenState, [folderId]: isOpen },
      }));
      const s = get();
      if (s.activeCruxId) saveFolderState(s.activeCruxId, s.folderOpenState);
    },

    // ── File operations ──

    startFileOperation: (op) => set({ activeFileOperation: op }),
    cancelFileOperation: () => set({ activeFileOperation: null }),

    // ── Context menu ──

    showContextMenu: (state) => set({ contextMenu: { ...state, visible: true } }),
    hideContextMenu: () => set({ contextMenu: { ...DEFAULT_CONTEXT_MENU } }),

    // ── Mobile ──

    setMobileActivePane: (pane) => set({ mobileActivePane: pane }),

    // ── Keeper Console ──

    setConsoleOpen: (open) => currentWorkspaceUI().getState().setPaneVisible('console', open),
    toggleConsole: () => currentWorkspaceUI().getState().togglePane('console'),
  }));

  if (cruxId) store.getState().setActiveCrux(cruxId);
  return store;
}

/** Garden-wide controls. Workspace panes use their own UI store. */
export const useUIStore = createUIStore();
export function useWorkspaceUIStoreApi() {
  const context = useContext(WorkspaceContext);
  const selected = useStore(workspaceSelection, (s) => s.active);
  const garden = useStore(gardenWorkspace, (s) => s.ui);
  // Garden Home on screen wins over a Crux workspace restored in the background.
  return context?.ui ?? garden ?? selected?.ui ?? useUIStore;
}
/** The workspace on screen — a Crux's, else the Garden Home's — for controls outside React. */
export function currentWorkspaceUI(): StoreApi<UIState> {
  return gardenWorkspace.getState().ui ?? workspaceSelection.getState().active?.ui ?? useUIStore;
}
export function useWorkspaceUIStore<T>(selector: (state: UIState) => T): T {
  return useStore(useWorkspaceUIStoreApi(), selector);
}
export function cancelPendingAgentApprovals(): void {
  useUIStore.getState().cancelApprovals();
}
