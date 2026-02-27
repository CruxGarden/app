import { create } from 'zustand';

// ── Pane Types ──────────────────────────────────────────

export type PaneType = 'history' | 'collaboration' | 'artifacts' | 'workshop' | 'details' | 'sync' | 'publish';

/** Neon highlight color for each pane (bright, like the green accent) */
export const PANE_COLORS: Record<PaneType, string> = {
  history:       '#a0aeb8', // silver
  collaboration: '#c8a84c', // yellow
  artifacts:     '#7db3a3', // green (matches accent)
  workshop:      '#5b9ed4', // blue
  details:       '#a07cc8', // purple
  sync:          '#d46b6b', // red
  publish:       '#d4944c', // orange
};

export type EditorViewMode = 'source' | 'preview';

export interface EditorTab {
  id: string;          // attachment ID
  path: string;        // file path (from meta.path or filename)
  name: string;        // display name (last segment)
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
}

// ── Full UI State ───────────────────────────────────────

interface UIState {
  // Pane system
  paneOrder: PaneType[];
  paneVisibility: Record<PaneType, boolean>;
  activeCruxId: string | null;

  // Editor
  editor: EditorPaneState;

  // File operations
  activeFileOperation: FileOperation | null;

  // Context menu
  contextMenu: ContextMenuState;

  // Mobile
  mobileActivePane: PaneType;

  // ── Layout actions ──
  setActiveCrux: (id: string | null) => void;
  togglePane: (pane: PaneType) => void;
  setPaneVisible: (pane: PaneType, visible: boolean) => void;
  reorderPanes: (newOrder: PaneType[]) => void;

  // ── Editor tab actions ──
  openFile: (id: string, path: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setTabDirty: (id: string, dirty: boolean) => void;
  setTabViewMode: (id: string, mode: EditorViewMode) => void;
  setTabScrollTop: (id: string, scrollTop: number) => void;
  setDiffTarget: (id: string | null) => void;
  closeAllTabs: () => void;

  // ── File operations ──
  startFileOperation: (op: FileOperation) => void;
  cancelFileOperation: () => void;

  // ── Context menu ──
  showContextMenu: (state: Omit<ContextMenuState, 'visible'>) => void;
  hideContextMenu: () => void;

  // ── Mobile ──
  setMobileActivePane: (pane: PaneType) => void;

  // ── Legacy compatibility ──
  fileViewerOpen: boolean;
  timelineOpen: boolean;
  toggleFileViewer: () => void;
  toggleTimeline: () => void;
  setFileViewer: (open: boolean) => void;
  setTimeline: (open: boolean) => void;
}

// ── Helpers ─────────────────────────────────────────────

function nameFromPath(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] || path;
}

const DEFAULT_PANE_ORDER: PaneType[] = ['history', 'collaboration', 'artifacts', 'workshop', 'details', 'sync', 'publish'];
const DEFAULT_VISIBILITY: Record<PaneType, boolean> = {
  history: false,
  collaboration: true,
  artifacts: false,
  workshop: false,
  details: false,
  sync: false,
  publish: false,
};

const DEFAULT_CONTEXT_MENU: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  targetId: null,
  targetPath: '',
  isFolder: false,
};

// ── Layout persistence ──────────────────────────────────

interface PersistedLayout {
  paneOrder: string[];
  paneVisibility: Record<string, boolean>;
}

const GLOBAL_LAYOUT_KEY = 'cruxgarden:layout:global';
const cruxLayoutKey = (id: string) => `cruxgarden:layout:${id}`;
const editorTabsKey = (id: string) => `cruxgarden:editor-tabs:${id}`;

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
    const raw = localStorage.getItem(editorTabsKey(cruxId));
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
  localStorage.setItem(editorTabsKey(cruxId), JSON.stringify(data));
}

/** Map old pane type names to current names */
const RENAME_MAP: Record<string, PaneType> = {
  navigation: 'history',
  chat: 'collaboration',
  editor: 'workshop',
  metadata: 'details',
};

/** Validate and migrate a persisted layout to match current PaneType values */
function validateLayout(layout: PersistedLayout): { paneOrder: PaneType[]; paneVisibility: Record<PaneType, boolean> } {
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

  return { paneOrder: validOrder, paneVisibility: validVisibility };
}

function loadLayout(key: string): PersistedLayout | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLayout(key: string, layout: { paneOrder: PaneType[]; paneVisibility: Record<PaneType, boolean> }) {
  localStorage.setItem(key, JSON.stringify(layout));
}

/** Load global layout, migrating from old Zustand persist key if needed */
function getInitialLayout(): { paneOrder: PaneType[]; paneVisibility: Record<PaneType, boolean> } {
  const global = loadLayout(GLOBAL_LAYOUT_KEY);
  if (global) return validateLayout(global);

  // Migrate from old persist key (cruxgarden:ui)
  try {
    const old = localStorage.getItem('cruxgarden:ui');
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
  } catch { /* ignore */ }

  return {
    paneOrder: [...DEFAULT_PANE_ORDER],
    paneVisibility: { ...DEFAULT_VISIBILITY },
  };
}

/** Resolve layout for a crux: crux-specific → global → defaults */
function resolveLayout(cruxId: string): { paneOrder: PaneType[]; paneVisibility: Record<PaneType, boolean> } {
  const cruxLayout = loadLayout(cruxLayoutKey(cruxId));
  if (cruxLayout) return validateLayout(cruxLayout);

  const globalLayout = loadLayout(GLOBAL_LAYOUT_KEY);
  if (globalLayout) return validateLayout(globalLayout);

  return { paneOrder: [...DEFAULT_PANE_ORDER], paneVisibility: { ...DEFAULT_VISIBILITY } };
}

const initialLayout = getInitialLayout();

// ── Store ───────────────────────────────────────────────

export const useUIStore = create<UIState>()(
    (set, get) => ({
      // ── Initial state ──
      paneOrder: initialLayout.paneOrder,
      paneVisibility: initialLayout.paneVisibility,
      activeCruxId: null,

      editor: {
        tabs: [],
        activeTabId: null,
        diffTargetId: null,
      },

      activeFileOperation: null,
      contextMenu: { ...DEFAULT_CONTEXT_MENU },
      mobileActivePane: 'collaboration' as PaneType,

      // ── Layout actions ──

      setActiveCrux: (id) => {
        // Save current editor tabs before switching
        const prev = get();
        if (prev.activeCruxId && prev.editor.tabs.length > 0) {
          saveEditorTabs(prev.activeCruxId, prev.editor);
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

          set({
            activeCruxId: id,
            paneOrder: layout.paneOrder,
            paneVisibility: layout.paneVisibility,
            editor: {
              tabs: restoredTabs,
              activeTabId: restoredActiveId,
              diffTargetId: null,
            },
          });
        } else {
          const global = loadLayout(GLOBAL_LAYOUT_KEY);
          const layout = global
            ? validateLayout(global)
            : { paneOrder: [...DEFAULT_PANE_ORDER], paneVisibility: { ...DEFAULT_VISIBILITY } };
          set({
            activeCruxId: null,
            paneOrder: layout.paneOrder,
            paneVisibility: layout.paneVisibility,
            editor: { tabs: [], activeTabId: null, diffTargetId: null },
          });
        }
      },

      togglePane: (pane) => {
        set((s) => ({
          paneVisibility: {
            ...s.paneVisibility,
            [pane]: !s.paneVisibility[pane],
          },
        }));
        const s = get();
        const layout = { paneOrder: s.paneOrder, paneVisibility: s.paneVisibility };
        saveLayout(s.activeCruxId ? cruxLayoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
      },

      setPaneVisible: (pane, visible) => {
        set((s) => ({
          paneVisibility: { ...s.paneVisibility, [pane]: visible },
        }));
        const s = get();
        const layout = { paneOrder: s.paneOrder, paneVisibility: s.paneVisibility };
        saveLayout(s.activeCruxId ? cruxLayoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
      },

      reorderPanes: (newOrder) => {
        set({ paneOrder: newOrder });
        const s = get();
        const layout = { paneOrder: s.paneOrder, paneVisibility: s.paneVisibility };
        saveLayout(s.activeCruxId ? cruxLayoutKey(s.activeCruxId) : GLOBAL_LAYOUT_KEY, layout);
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
            tabs: s.editor.tabs.map((t) =>
              t.id === id ? { ...t, dirty } : t,
            ),
          },
        })),

      setTabViewMode: (id, mode) => {
        set((s) => ({
          editor: {
            ...s.editor,
            tabs: s.editor.tabs.map((t) =>
              t.id === id ? { ...t, viewMode: mode } : t,
            ),
          },
        }));
        const s = get();
        if (s.activeCruxId) saveEditorTabs(s.activeCruxId, s.editor);
      },

      setTabScrollTop: (id, scrollTop) =>
        set((s) => ({
          editor: {
            ...s.editor,
            tabs: s.editor.tabs.map((t) =>
              t.id === id ? { ...t, scrollTop } : t,
            ),
          },
        })),

      setDiffTarget: (id) =>
        set((s) => ({ editor: { ...s.editor, diffTargetId: id } })),

      closeAllTabs: () => {
        set((s) => ({
          editor: { ...s.editor, tabs: [], activeTabId: null, diffTargetId: null },
        }));
        const s = get();
        if (s.activeCruxId) saveEditorTabs(s.activeCruxId, s.editor);
      },

      // ── File operations ──

      startFileOperation: (op) => set({ activeFileOperation: op }),
      cancelFileOperation: () => set({ activeFileOperation: null }),

      // ── Context menu ──

      showContextMenu: (state) =>
        set({ contextMenu: { ...state, visible: true } }),
      hideContextMenu: () =>
        set({ contextMenu: { ...DEFAULT_CONTEXT_MENU } }),

      // ── Mobile ──

      setMobileActivePane: (pane) => set({ mobileActivePane: pane }),

      // ── Legacy compatibility (derived from pane system) ──

      get fileViewerOpen() {
        const s = get();
        return s.paneVisibility.artifacts || s.paneVisibility.workshop;
      },
      get timelineOpen() {
        return get().paneVisibility.history;
      },

      toggleFileViewer: () => {
        const s = get();
        if (s.paneVisibility.artifacts) {
          set((prev) => ({
            paneVisibility: { ...prev.paneVisibility, artifacts: false, workshop: false },
          }));
        } else {
          set((prev) => ({
            paneVisibility: { ...prev.paneVisibility, artifacts: true },
          }));
        }
      },
      toggleTimeline: () => {
        const s = get();
        set((prev) => ({
          paneVisibility: { ...prev.paneVisibility, history: !s.paneVisibility.history },
        }));
      },
      setFileViewer: (open) =>
        set((s) => ({
          paneVisibility: { ...s.paneVisibility, workshop: open },
        })),
      setTimeline: (open) =>
        set((s) => ({
          paneVisibility: { ...s.paneVisibility, history: open },
        })),
    }),
);
