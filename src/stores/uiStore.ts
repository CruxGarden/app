import { create } from 'zustand';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import type { MosaicNode } from 'react-mosaic-component';
import type { TemplateLayout } from '@/templates';

// ── Pane Types ──────────────────────────────────────────

export type PaneType =
  | 'history'
  | 'collaboration'
  | 'artifacts'
  | 'workshop'
  | 'details'
  | 'sync'
  | 'publish'
  | 'export'
  | 'store';

/** Rainbow gradient colors for each pane — reads from CSS custom properties set by the palette system */
export const PANE_COLORS: Record<PaneType, string> = {
  collaboration: 'var(--pane-collaboration)',
  artifacts: 'var(--pane-artifacts)',
  workshop: 'var(--pane-workshop)',
  details: 'var(--pane-details)',
  history: 'var(--pane-history)',
  export: 'var(--pane-export)',
  sync: 'var(--pane-sync)',
  publish: 'var(--pane-publish)',
  store: 'var(--pane-store)',
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

interface UIState {
  // Pane system
  paneOrder: PaneType[];
  paneVisibility: Record<PaneType, boolean>;
  mosaicLayout: MosaicNode<PaneType> | null;
  activeCruxId: string | null;

  // Editor
  editor: EditorPaneState;

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
  consoleOpen: boolean;

  // Settings modal
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  // Explore modal
  exploreOpen: boolean;
  setExploreOpen: (open: boolean) => void;
  /** Kind filter Explore opens with (e.g. 'mood'); consumed on mount */
  exploreKind: string | null;
  openExplore: (kind?: string | null) => void;

  // Mood modal (quick presets/background/persona; opens the Mood Builder page)
  moodPanelOpen: boolean;
  setMoodPanelOpen: (open: boolean) => void;
  toggleMoodPanel: () => void;
  /** Pixels the Mood Bar reserves at the bottom of <main> so it never covers pane controls. */
  dockReserve: number;
  setDockReserve: (px: number) => void;

  // ── Layout actions ──

  /** Persist a new crux's initial pane layout (template preset or a blank fallback). */
  seedCruxLayout: (
    cruxId: string,
    layout: TemplateLayout | null,
    fallback: 'ai' | 'manual',
  ) => void;
  setActiveCrux: (id: string | null) => void;
  togglePane: (pane: PaneType) => void;
  setPaneVisible: (pane: PaneType, visible: boolean) => void;
  reorderPanes: (newOrder: PaneType[]) => void;
  setMosaicLayout: (layout: MosaicNode<PaneType> | null) => void;

  // ── Editor tab actions ──
  openFile: (id: string, path: string) => void;
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

export const DEFAULT_PANE_ORDER: PaneType[] = [
  'collaboration',
  'artifacts',
  'workshop',
  'details',
  'history',
  'export',
  'sync',
  'publish',
  'store',
];
const DEFAULT_VISIBILITY: Record<PaneType, boolean> = {
  history: false,
  collaboration: true,
  artifacts: false,
  workshop: false,
  details: false,
  sync: false,
  publish: false,
  export: false,
  store: false,
};

// ── Mosaic layout helpers ────────────────────────────────

/** Get all leaf pane types from a mosaic tree */
export function getMosaicLeaves(node: MosaicNode<PaneType> | null): PaneType[] {
  if (node === null) return [];
  if (typeof node === 'string') return [node];
  return [...getMosaicLeaves(node.first), ...getMosaicLeaves(node.second)];
}

/** Build a balanced mosaic tree from a list of visible panes */
function buildMosaicTree(panes: PaneType[]): MosaicNode<PaneType> | null {
  if (panes.length === 0) return null;
  if (panes.length === 1) return panes[0]!;
  const mid = Math.ceil(panes.length / 2);
  return {
    direction: 'row',
    first: buildMosaicTree(panes.slice(0, mid))!,
    second: buildMosaicTree(panes.slice(mid))!,
    splitPercentage: (mid / panes.length) * 100,
  };
}

/** Add a pane to an existing mosaic tree */
function addPaneToMosaic(tree: MosaicNode<PaneType> | null, pane: PaneType): MosaicNode<PaneType> {
  if (tree === null) return pane;
  return {
    direction: 'row',
    first: tree,
    second: pane,
    splitPercentage: 75,
  };
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
const cruxLayoutKey = (id: string) => `cruxgarden:layout:${id}`;
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
function validateLayout(layout: PersistedLayout): ValidatedLayout {
  const allPanes = new Set<PaneType>(DEFAULT_PANE_ORDER);

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
  for (const pane of DEFAULT_PANE_ORDER) {
    if (!validOrder.includes(pane)) {
      validOrder.push(pane);
    }
  }

  // Build visibility with defaults for missing entries
  const validVisibility = {} as Record<PaneType, boolean>;
  for (const pane of DEFAULT_PANE_ORDER) {
    validVisibility[pane] = renamedVisibility[pane] ?? DEFAULT_VISIBILITY[pane];
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
    saveLayout(s.activeCruxId ? cruxLayoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
  }, 300);
}

/** Load global layout, migrating from old Zustand persist key if needed */
function getInitialLayout(): ValidatedLayout {
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
  const cruxLayout = loadLayout(cruxLayoutKey(cruxId));
  if (cruxLayout) return validateLayout(cruxLayout);

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

export const useUIStore = create<UIState>()((set, get) => ({
  // ── Initial state ──
  paneOrder: initialLayout.paneOrder,
  paneVisibility: initialLayout.paneVisibility,
  mosaicLayout: initialLayout.mosaicLayout,
  activeCruxId: null,

  editor: {
    tabs: [],
    activeTabId: null,
    diffTargetId: null,
  },

  activeFileOperation: null,
  folderOpenState: {},
  contextMenu: { ...DEFAULT_CONTEXT_MENU },
  mobileActivePane: 'collaboration' as PaneType,
  aiEnabled: false,
  setAiEnabled: (enabled) => set({ aiEnabled: enabled }),
  consoleOpen: false,
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  exploreOpen: false,
  setExploreOpen: (open) => set({ exploreOpen: open }),
  exploreKind: null,
  openExplore: (kind = null) => set({ exploreOpen: true, exploreKind: kind }),

  // ── Layout actions ──

  seedCruxLayout: (cruxId, layout, fallback) => {
    const visibility: Record<string, boolean> = {};
    for (const pane of DEFAULT_PANE_ORDER) visibility[pane] = false;
    if (layout) {
      for (const pane of layout.panes) visibility[pane] = true;
      setSetting(
        cruxLayoutKey(cruxId),
        JSON.stringify({
          paneOrder: DEFAULT_PANE_ORDER,
          paneVisibility: visibility,
          mosaicLayout: layout.mosaic,
        }),
      );
      return;
    }
    // Blank workspace: chat + details when an AI key exists (the AI builds),
    // chat + files + workshop when the user will build by hand.
    visibility.collaboration = true;
    if (fallback === 'ai') visibility.details = true;
    else {
      visibility.artifacts = true;
      visibility.workshop = true;
    }
    setSetting(
      cruxLayoutKey(cruxId),
      JSON.stringify({ paneOrder: DEFAULT_PANE_ORDER, paneVisibility: visibility }),
    );
  },
  moodPanelOpen: false,
  setMoodPanelOpen: (open) => set({ moodPanelOpen: open }),
  toggleMoodPanel: () => set((s) => ({ moodPanelOpen: !s.moodPanelOpen })),
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
    const prev = get();
    const wasVisible = prev.paneVisibility[pane];
    const newVisibility = { ...prev.paneVisibility, [pane]: !wasVisible };

    // Update mosaic tree: add or remove the pane
    let newMosaic: MosaicNode<PaneType> | null;
    if (!wasVisible) {
      newMosaic = addPaneToMosaic(prev.mosaicLayout, pane);
    } else {
      newMosaic = prev.mosaicLayout ? removePaneFromMosaic(prev.mosaicLayout, pane) : null;
    }

    // Derive pane order from the mosaic tree leaves
    const newOrder = newMosaic ? getMosaicLeaves(newMosaic) : prev.paneOrder;

    set({ paneVisibility: newVisibility, paneOrder: newOrder, mosaicLayout: newMosaic });
    const s = get();
    const layout = {
      paneOrder: s.paneOrder,
      paneVisibility: s.paneVisibility,
      mosaicLayout: s.mosaicLayout,
    };
    saveLayout(s.activeCruxId ? cruxLayoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
  },

  setPaneVisible: (pane, visible) => {
    const prev = get();
    let newMosaic = prev.mosaicLayout;
    if (visible && !prev.paneVisibility[pane]) {
      newMosaic = addPaneToMosaic(newMosaic, pane);
    } else if (!visible && prev.paneVisibility[pane]) {
      newMosaic = newMosaic ? removePaneFromMosaic(newMosaic, pane) : null;
    }
    const newOrder = newMosaic ? getMosaicLeaves(newMosaic) : prev.paneOrder;
    set({
      paneVisibility: { ...prev.paneVisibility, [pane]: visible },
      mosaicLayout: newMosaic,
      paneOrder: newOrder,
    });
    const s = get();
    const layout = {
      paneOrder: s.paneOrder,
      paneVisibility: s.paneVisibility,
      mosaicLayout: s.mosaicLayout,
    };
    saveLayout(s.activeCruxId ? cruxLayoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
  },

  reorderPanes: (newOrder) => {
    set({ paneOrder: newOrder });
    const s = get();
    const layout = {
      paneOrder: s.paneOrder,
      paneVisibility: s.paneVisibility,
      mosaicLayout: s.mosaicLayout,
    };
    saveLayout(s.activeCruxId ? cruxLayoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
  },

  setMosaicLayout: (newLayout) => {
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

    // Debounce persistence to avoid writes on every resize frame
    debouncedSaveLayout(get);
  },

  // ── Editor tab actions ──

  openFile: (id, path) => {
    set((s) => {
      const existing = s.editor.tabs.find((t) => t.id === id);
      if (existing) {
        return { editor: { ...s.editor, activeTabId: id } };
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

  setConsoleOpen: (open) => set({ consoleOpen: open }),
  toggleConsole: () => set((s) => ({ consoleOpen: !s.consoleOpen })),
}));
