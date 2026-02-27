import { create } from 'zustand';

// ── Pane Types ──────────────────────────────────────────

export type PaneType = 'navigation' | 'chat' | 'artifacts' | 'editor' | 'metadata';

export type EditorViewMode = 'source' | 'preview' | 'diff';

export interface EditorTab {
  id: string;          // attachment ID
  path: string;        // file path (from meta.path or filename)
  name: string;        // display name (last segment)
  dirty: boolean;
  viewMode: EditorViewMode;
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
  // These are kept so existing TopBar/Crux code doesn't break during migration
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

const DEFAULT_PANE_ORDER: PaneType[] = ['navigation', 'chat', 'artifacts', 'editor', 'metadata'];
const DEFAULT_VISIBILITY: Record<PaneType, boolean> = {
  navigation: false,
  chat: true,
  artifacts: false,
  editor: false,
  metadata: false,
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
  paneOrder: PaneType[];
  paneVisibility: Record<PaneType, boolean>;
}

const GLOBAL_LAYOUT_KEY = 'cruxgarden:layout:global';
const cruxLayoutKey = (id: string) => `cruxgarden:layout:${id}`;

function loadLayout(key: string): PersistedLayout | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLayout(key: string, layout: PersistedLayout) {
  localStorage.setItem(key, JSON.stringify(layout));
}

/** Load global layout, migrating from old Zustand persist key if needed */
function getInitialLayout(): PersistedLayout {
  const global = loadLayout(GLOBAL_LAYOUT_KEY);
  if (global) return global;

  // Migrate from old persist key (cruxgarden:ui)
  try {
    const old = localStorage.getItem('cruxgarden:ui');
    if (old) {
      const parsed = JSON.parse(old);
      if (parsed.state?.paneOrder) {
        const migrated: PersistedLayout = {
          paneOrder: parsed.state.paneOrder,
          paneVisibility: parsed.state.paneVisibility,
        };
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
function resolveLayout(cruxId: string): PersistedLayout {
  return loadLayout(cruxLayoutKey(cruxId))
    ?? loadLayout(GLOBAL_LAYOUT_KEY)
    ?? { paneOrder: [...DEFAULT_PANE_ORDER], paneVisibility: { ...DEFAULT_VISIBILITY } };
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
      mobileActivePane: 'chat' as PaneType,

      // ── Layout actions ──

      setActiveCrux: (id) => {
        if (id) {
          const layout = resolveLayout(id);
          set({ activeCruxId: id, paneOrder: layout.paneOrder, paneVisibility: layout.paneVisibility });
        } else {
          const global = loadLayout(GLOBAL_LAYOUT_KEY)
            ?? { paneOrder: [...DEFAULT_PANE_ORDER], paneVisibility: { ...DEFAULT_VISIBILITY } };
          set({ activeCruxId: null, paneOrder: global.paneOrder, paneVisibility: global.paneVisibility });
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

      openFile: (id, path) =>
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
          };
          return {
            editor: {
              ...s.editor,
              tabs: [...s.editor.tabs, tab],
              activeTabId: id,
            },
          };
        }),

      closeTab: (id) =>
        set((s) => {
          const tabs = s.editor.tabs.filter((t) => t.id !== id);
          let activeTabId = s.editor.activeTabId;
          if (activeTabId === id) {
            const closedIndex = s.editor.tabs.findIndex((t) => t.id === id);
            activeTabId = tabs[Math.min(closedIndex, tabs.length - 1)]?.id ?? null;
          }
          return { editor: { ...s.editor, tabs, activeTabId } };
        }),

      setActiveTab: (id) =>
        set((s) => ({ editor: { ...s.editor, activeTabId: id } })),

      setTabDirty: (id, dirty) =>
        set((s) => ({
          editor: {
            ...s.editor,
            tabs: s.editor.tabs.map((t) =>
              t.id === id ? { ...t, dirty } : t,
            ),
          },
        })),

      setTabViewMode: (id, mode) =>
        set((s) => ({
          editor: {
            ...s.editor,
            tabs: s.editor.tabs.map((t) =>
              t.id === id ? { ...t, viewMode: mode } : t,
            ),
          },
        })),

      setDiffTarget: (id) =>
        set((s) => ({ editor: { ...s.editor, diffTargetId: id } })),

      closeAllTabs: () =>
        set((s) => ({
          editor: { ...s.editor, tabs: [], activeTabId: null, diffTargetId: null },
        })),

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
        return s.paneVisibility.artifacts || s.paneVisibility.editor;
      },
      get timelineOpen() {
        return get().paneVisibility.navigation;
      },

      toggleFileViewer: () => {
        const s = get();
        // Toggle artifacts pane; if editor is the only one showing, toggle that instead
        if (s.paneVisibility.artifacts) {
          set((prev) => ({
            paneVisibility: { ...prev.paneVisibility, artifacts: false, editor: false },
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
          paneVisibility: { ...prev.paneVisibility, navigation: !s.paneVisibility.navigation },
        }));
      },
      setFileViewer: (open) =>
        set((s) => ({
          paneVisibility: { ...s.paneVisibility, editor: open },
        })),
      setTimeline: (open) =>
        set((s) => ({
          paneVisibility: { ...s.paneVisibility, navigation: open },
        })),
    }),
);
