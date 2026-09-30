import DeferredImportNotice from './DeferredImportNotice';
import { useAppAppearance } from '@/hooks/useAppAppearance';
import TaskBar from './TaskBar';
import { usePaneLabels } from '@/hooks/usePaneLabels';
import { WORKSPACE_ATTR } from '@/components/plasma/PlasmaStage';
import { useSurfaceFormed } from '@/components/plasma/useSurfaceFormed';
import { useNotebookProxy } from '@/hooks/useNotebookProxy';
import { useWorkspaceUIStoreApi } from '@/stores/uiStore';
import { copyIdentity, listWorkingCopies, TASKS_CHANGED } from '@/services/working-copies';
import { useCruxStoreApi } from '@/stores/cruxStore';
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  type ComponentType,
  type CSSProperties,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { MosaicWithoutDragDropContext, MosaicWindow } from 'react-mosaic-component';
import type { MosaicBranch, MosaicNode } from 'react-mosaic-component';
import { PaneEmpty } from './pane-ui';
import { usePaneWidth } from '@/hooks/usePaneWidth';
import { Spinner } from '@/components/ui';
import { PANE_MIN_WIDTH, useWorkspaceUIStore as useUIStore, type PaneType } from '@/stores/uiStore';
import { useStoreProxy } from '@/hooks/useStoreProxy';
import { useFunctionsProxy } from '@/hooks/useFunctionsProxy';
import { useMediaProxy } from '@/hooks/useMediaProxy';
import { useStackProxy } from '@/hooks/useStackProxy';
import { useLinkProxy } from '@/hooks/useLinkProxy';
import { useRunnerProxy } from '@/hooks/useRunnerProxy';
import { useIsDesktopLayout } from '@/hooks/useMediaQuery';

const HistoryPane = lazy(() => import('./HistoryPane'));
const HomePane = lazy(() => import('./HomePane'));
const ConsolePane = lazy(() => import('./ConsolePane'));
const NavigatorPane = lazy(() => import('./NavigatorPane'));
const TendingPane = lazy(() => import('./TendingPane'));
const ChatPane = lazy(() => import('./ChatPane'));
const ArtifactsPane = lazy(() => import('./ArtifactsPane'));
const EditorPane = lazy(() => import('./EditorPane'));
const MetadataPane = lazy(() => import('./MetadataPane'));
const SyncPane = lazy(() => import('./SyncPane'));
const PublishPane = lazy(() => import('./PublishPane'));
const ExportPane = lazy(() => import('./ExportPane'));
const StorePane = lazy(() => import('./StorePane'));
const MediaPane = lazy(() => import('./MediaPane'));
const MoodPane = lazy(() => import('./MoodPane'));
const SynthPane = lazy(() => import('./SynthPane'));
const BrowserPane = lazy(() => import('./BrowserPane'));
const SettingsPane = lazy(() => import('./SettingsPane'));
const ExplorePane = lazy(() => import('./ExplorePane'));
import { PANE_VAR_PREFIX } from './paneConfig';
import PaneIcon from './PaneIcon';
import ContextMenu from './ContextMenu';
import MobilePaneSwitcher from './MobilePaneSwitcher';
import { CloseIcon } from '@/components/ui/icons';
import { useCruxStore } from '@/stores/cruxStore';
import { Capability, can } from '@/lib/platform';
import { useAppStore } from '@/stores/appStore';
import { getDownloadUrl } from '@/api/public';
import { pathOf, basename, isUnder, displayNameOf } from '@/lib/artifact-path';
import 'react-mosaic-component/react-mosaic-component.css';
import { alertDialog } from '@/stores/dialogStore';
import { expandTreeSelection } from '@/components/artifacts/treeData';
import { confirmAndDeleteArtifacts } from '@/components/artifacts/safeDelete';

// ── Media transcoding constants ──────────────────────────

const STREAMING_MEDIA_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/mpeg',
  'video/ogg',
  'video/3gpp',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/x-m4a',
  'audio/mp4',
  'audio/webm',
]);

const STREAMING_READY = new Set([
  'video/mp4',
  'video/webm',
  'audio/mp4',
  'audio/webm',
  'audio/aac',
]);

// ── Pane component registry ─────────────────────────────

const PANE_COMPONENTS: Record<PaneType, React.ComponentType> = {
  tasks: TaskBar,
  history: HistoryPane,
  collaboration: ChatPane,
  artifacts: ArtifactsPane,
  workshop: EditorPane,
  details: MetadataPane,
  sync: SyncPane,
  publish: PublishPane,
  export: ExportPane,
  store: StorePane,
  media: MediaPane,
  mood: MoodPane,
  synth: SynthPane,
  browser: BrowserPane,
  settings: SettingsPane,
  explore: ExplorePane,
  home: HomePane,
  console: ConsolePane,
  navigator: NavigatorPane,
  tending: TendingPane,
};

// Memoized pane content — prevents React from re-diffing heavy subtrees
// (Monaco, chat, file tree) when only mosaic split percentages change

/** A pane is a named region; Crux Synth's own section already carries that name. */
const paneRegion = (paneType: PaneType, label: string) =>
  paneType === 'synth' ? {} : { role: 'region', 'aria-label': label };

const MemoizedPaneContent = memo(function MemoizedPaneContent({
  paneType,
}: {
  paneType: PaneType;
}) {
  const PaneComponent = PANE_COMPONENTS[paneType];
  return (
    <div className="pane-freeze-wrapper">
      <Suspense fallback={null}>
        <PaneComponent />
      </Suspense>
    </div>
  );
});

/**
 * What sits inside a tile: the pane, once the tile is wide enough and (in a
 * Crux workspace) the crux has loaded — otherwise a word about why not. Empty
 * frames with nothing in them read as broken (Daniel, 2026-09-07: a slow first
 * open after a restart).
 */
function PaneFrame({
  paneType,
  gate,
}: {
  paneType: PaneType;
  /** Why the pane cannot show yet, if it cannot; null when it can. */
  gate?: (labels: Record<PaneType, string>) => ReactNode;
}) {
  const { ref, isTooNarrow } = usePaneWidth(PANE_MIN_WIDTH[paneType]);
  const labels = usePaneLabels();
  // Under Plasma the pane's contents mount once its surface has formed, so
  // Monaco, an app's iframe or a long conversation do not compete with the
  // material's arrival for the same frames.
  const formed = useSurfaceFormed(ref);
  const gated = formed ? gate?.(labels) : null;
  return (
    <div
      ref={ref}
      className="h-full min-h-0 flex flex-col"
      data-testid={`pane-body-${paneType}`}
      {...paneRegion(paneType, labels[paneType])}
    >
      {!formed ? null : gated ? (
        gated
      ) : isTooNarrow ? (
        <PaneEmpty
          title="Widen the pane"
          description={`${labels[paneType]} needs a little more room to show its contents.`}
          className="h-full"
        />
      ) : (
        <MemoizedPaneContent paneType={paneType} />
      )}
    </div>
  );
}

/** A Crux workspace tile: waits for the crux, and keeps Main-only panes out of a Working Copy. */
function PaneBody({ paneType }: { paneType: PaneType }) {
  const loaded = useCruxStore((s) => !!s.crux);
  const copy = useCruxStore((s) => copyIdentity(s.crux));
  const gate = useCallback(
    (labels: Record<PaneType, string>) =>
      copy && ['publish', 'sync', 'details', 'export'].includes(paneType) ? (
        <PaneEmpty
          title="Available in Main"
          description="Open Main to manage the Crux’s details, publishing and complete backup."
        />
      ) : !loaded ? (
        <PaneEmpty
          icon={<Spinner size={16} />}
          title="Opening…"
          description={`${labels[paneType]} appears as soon as the crux has loaded.`}
          className="h-full"
        />
      ) : null,
    [copy, loaded, paneType],
  );
  return <PaneFrame paneType={paneType} gate={gate} />;
}

// Title case here; the Mood decides the rendered case (--pane-header-label-case,
// uppercase by default), so a theme can ask for "Collaboration" or "collaboration".

function MobilePane({ pane }: { pane: PaneType }) {
  const PaneComponent = PANE_COMPONENTS[pane];
  return <PaneComponent />;
}

// ── Pane icons ───────────────────────────────────────────

/**
 * The tiles of a workspace — a Crux's or a Garden's: headers, close, resize and
 * rearrange. `Body` decides what a tile shows (the pane, or why not yet).
 */
export function PaneMosaic({ Body }: { Body: ComponentType<{ paneType: PaneType }> }) {
  const labels = usePaneLabels();
  const mosaicLayout = useUIStore((s) => s.mosaicLayout);
  const setMosaicLayout = useUIStore((s) => s.setMosaicLayout);
  const setPaneVisible = useUIStore((s) => s.setPaneVisible);
  const mobileActivePane = useUIStore((s) => s.mobileActivePane);
  const isDesktopLayout = useIsDesktopLayout();
  const layoutRef = useRef<HTMLDivElement>(null);
  const setWorkspaceGeometry = useUIStore((s) => s.setWorkspaceGeometry);
  useEffect(() => {
    const container = layoutRef.current;
    if (!container || !isDesktopLayout) return;
    const measure = () => {
      const root = container.querySelector<HTMLElement>('.mosaic-root');
      const tile = container.querySelector<HTMLElement>('.mosaic-tile');
      const window = container.querySelector<HTMLElement>('.mosaic-window');
      if (!root || !tile || !window) return;
      const tileStyle = getComputedStyle(tile);
      const windowStyle = getComputedStyle(window);
      const frameWidth = [
        tileStyle.marginLeft,
        tileStyle.marginRight,
        windowStyle.paddingLeft,
        windowStyle.paddingRight,
      ].reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
      setWorkspaceGeometry(root.getBoundingClientRect().width, frameWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    document.addEventListener('palette-change', measure);
    measure();
    return () => {
      observer.disconnect();
      document.removeEventListener('palette-change', measure);
    };
  }, [isDesktopLayout, setWorkspaceGeometry]);
  const handleChange = useCallback(
    (newNode: MosaicNode<PaneType> | null) => {
      setMosaicLayout(newNode);
    },
    [setMosaicLayout],
  );

  // Render each tile with custom toolbar containing icon + label + close
  const renderTile = useCallback(
    (paneType: PaneType, path: MosaicBranch[]) => {
      // Pane header tokens — read directly from CSS vars set by the mood palette
      const prefix = PANE_VAR_PREFIX[paneType];

      return (
        <MosaicWindow<PaneType>
          path={path}
          title={labels[paneType]}
          className={`pane-${paneType} motion-enter-pane`}
          renderToolbar={() => (
            <div
              className="pane-toolbar"
              style={
                {
                  // Painted by shape.css (so paneHeaderShape can restyle the
                  // header); passed as properties so a header token may be a gradient.
                  '--pane-header-bg': `var(${prefix}-header)`,
                  '--pane-header-border-color': `var(${prefix}-header-border)`,
                  '--pane-header-hover-bg': `var(${prefix}-button-active)`,
                } as CSSProperties
              }
            >
              <div
                className="flex items-center gap-2"
                style={{ color: `var(${prefix}-header-text)` }}
              >
                <span className="pane-toolbar-icon" style={{ color: `var(${prefix}-header-icon)` }}>
                  <PaneIcon type={paneType} size={14} strokeWidth={2} />
                </span>
                <span className="pane-toolbar-label">{labels[paneType]}</span>
              </div>
              {/* Home is the Garden's anchor: it stays. */}
              {paneType !== 'home' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPaneVisible(paneType, false);
                  }}
                  // The colour rides on a variable, not an inline `color`, so the
                  // header's hover colour (globals.css) can take over on hover.
                  className="pane-toolbar-close w-6 h-6 inline-flex items-center justify-center rounded-[var(--radius-sm)] [color:var(--pt-close)] hover:bg-action-button-hover active-dim motion-press cursor-pointer"
                  style={{ '--pt-close': `var(${prefix}-header-close)` } as React.CSSProperties}
                  title={`Close ${labels[paneType]}`}
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </div>
          )}
        >
          <Body paneType={paneType} />
        </MosaicWindow>
      );
    },
    [setPaneVisible, labels, Body],
  );

  // Exactly one layout is mounted. Rendering both and hiding one with CSS
  // double-mounted every pane: two chat trees (two useChat loops, two
  // auto-snapshot policies), duplicate DOM, and 2× re-renders per streamed token.
  return isDesktopLayout ? (
    <div ref={layoutRef} className="h-full min-h-0">
      {mosaicLayout ? (
        <MosaicWithoutDragDropContext<PaneType>
          renderTile={renderTile}
          value={mosaicLayout}
          onChange={handleChange}
          resize={{ minimumPaneSizePercentage: 5 }}
          className="crux-mosaic-theme"
        />
      ) : null}
    </div>
  ) : (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 group/pane">
        <Suspense fallback={null}>
          <MobilePane pane={mobileActivePane} />
        </Suspense>
      </div>
      <MobilePaneSwitcher />
    </div>
  );
}

/** A Garden workspace tile: no Crux to wait for, only room to show the pane. */
export function GardenPaneBody({ paneType }: { paneType: PaneType }) {
  return <PaneFrame paneType={paneType} />;
}

// ── Main layout ─────────────────────────────────────────

/**
 * Tasks is not open to begin with (UX pass, 2026-09-27): it arrives when a
 * task does — one is created while this Crux is open — and whenever the
 * workspace is itself a task, so Main is one click away. Closing it again is
 * the person's choice; it is not forced back on every visit.
 */
function useTasksArrive() {
  const ui = useWorkspaceUIStoreApi();
  const setPaneVisible = useUIStore((s) => s.setPaneVisible);
  const crux = useCruxStore((s) => s.crux);
  const copy = copyIdentity(crux);
  const mainId = copy?.cruxId ?? crux?.id;
  const inTask = !!copy;
  useEffect(() => {
    if (inTask) setPaneVisible('tasks', true);
  }, [inTask, setPaneVisible]);
  useEffect(() => {
    if (!mainId) return;
    let known: number | null = null;
    let live = true;
    // A Crux that arrives with Tasks already (imported, restored on another
    // machine) shows them on its first, fresh layout; after that a new Task
    // brings the pane back, and a closed pane otherwise stays closed.
    const fresh = ui.getState().layoutFresh;
    const check = () => {
      void listWorkingCopies(mainId)
        .then((rows) => {
          if (!live) return;
          if (known === null ? fresh && rows.length > 0 : rows.length > known)
            setPaneVisible('tasks', true);
          known = rows.length;
        })
        .catch(() => {});
    };
    check();
    window.addEventListener(TASKS_CHANGED, check);
    return () => {
      live = false;
      window.removeEventListener(TASKS_CHANGED, check);
    };
  }, [mainId, setPaneVisible, ui]);
}

export default function WorkspaceLayout() {
  // The builder is open: the material calms its ripple while it is (PlasmaStage).
  useEffect(() => {
    document.documentElement.setAttribute(WORKSPACE_ATTR, '');
    return () => document.documentElement.removeAttribute(WORKSPACE_ATTR);
  }, []);
  const cruxStore = useCruxStoreApi();
  const uiStore = useWorkspaceUIStoreApi();
  const setPaneVisible = useUIStore((s) => s.setPaneVisible);
  const paneVisibility = useUIStore((s) => s.paneVisibility);
  useTasksArrive();
  const openFile = useUIStore((s) => s.openFile);
  const artifacts = useCruxStore((s) => s.artifacts);
  const crux = useCruxStore((s) => s.crux);
  const author = useAppStore((s) => s.author);

  // Proxy crux:store:* postMessages from preview iframe to local SQLite
  useStoreProxy(crux?.id ?? null);
  useFunctionsProxy(crux?.id ?? null);
  useMediaProxy(crux?.id ?? null);
  useStackProxy(crux?.id ?? null);
  useLinkProxy(crux?.id ?? null);
  useRunnerProxy(crux?.id ?? null);
  useNotebookProxy(crux?.id ?? null);
  useAppAppearance(crux?.id ?? null, crux?.kind === 'notes' || crux?.meta?.template === 'moqira');

  // Context menu handlers
  const handleNewFile = (parentPath: string) => {
    uiStore.getState().startFileOperation({
      type: 'create-file',
      parentPath,
    });
  };

  const handleNewFolder = (parentPath: string) => {
    uiStore.getState().startFileOperation({
      type: 'create-folder',
      parentPath,
    });
  };

  const handleRename = (_id: string, path: string) => {
    uiStore.getState().startFileOperation({
      type: 'rename',
      targetPath: path,
    });
  };

  const handleDelete = async (id: string) => {
    await confirmAndDeleteArtifacts(cruxStore, [id], 'Delete this file?');
  };

  const handleDeleteMultiple = async (ids: string[]) => {
    // Selections mix folder virtual ids ("folder:path") with artifact ids.
    const artifactIds = expandTreeSelection(ids, artifacts);
    const count = artifactIds.length;
    if (count === 0) return;
    await confirmAndDeleteArtifacts(
      cruxStore,
      artifactIds,
      `Delete ${count} item${count !== 1 ? 's' : ''}?`,
    );
  };

  const handleDeleteFolder = async (folderPath: string) => {
    const children = artifacts.filter((a) => isUnder(folderPath, pathOf(a)));
    if (children.length === 0) return;
    const folderName = basename(folderPath);
    await confirmAndDeleteArtifacts(
      cruxStore,
      children.map((a) => a.id),
      `Delete "${folderName}" and ${children.length} file${children.length !== 1 ? 's' : ''}?`,
      'Delete folder',
    );
  };

  const handleCopyUrl = (id: string) => {
    const username = author?.username;
    const slug = crux?.slug;
    if (username && slug) {
      const url = getDownloadUrl(username, slug, id);
      navigator.clipboard.writeText(url);
    }
  };

  const isMediaFile = useCallback(
    (id: string) => {
      const artifact = artifacts.find((a) => a.id === id);
      if (!artifact) return false;
      const mime = artifact.mimeType || '';
      const path = pathOf(artifact);
      // Don't offer transcode for files already in streaming/ dir or already streaming-ready
      if (path.startsWith('streaming/')) return false;
      if (STREAMING_READY.has(mime)) return false;
      return STREAMING_MEDIA_TYPES.has(mime);
    },
    [artifacts],
  );

  const ffmpegAvailable = can(Capability.Transcode);

  const handleTranscode = useCallback(
    async (id: string) => {
      const artifact = artifacts.find((a) => a.id === id);
      if (!artifact?.fingerprint) return;
      if (!can(Capability.Transcode)) return;

      const { readBlob } = await import('@/services/blobs');
      const content = await readBlob(artifact.fingerprint);
      if (!content || content.length === 0) return;

      const inputName = displayNameOf(artifact, 'media');
      const baseName = inputName.replace(/\.[^.]+$/, '');
      const mime = artifact.mimeType || '';
      const isAudio = mime.startsWith('audio/');

      try {
        const { transcode } = await import('@/services/media');
        const results = await transcode({
          inputData: content,
          inputName,
          isAudio,
        });

        const uploadFile = cruxStore.getState().uploadFile;
        for (const result of results) {
          const blob = new Blob([new Uint8Array(result.data)], { type: result.mimeType });
          const file = new File([blob], result.name, { type: result.mimeType });
          await uploadFile(file, `streaming/${baseName}`);
        }
      } catch (err) {
        console.error('Transcode failed:', err);
        void alertDialog('Transcode failed: ' + (err as Error).message, 'Transcode failed');
      }
    },
    [artifacts, cruxStore],
  );

  const handleOpen = (id: string) => {
    const artifact = artifacts.find((a) => a.id === id);
    if (!artifact) return;
    const path = pathOf(artifact) || artifact.id;
    openFile(id, path);
    if (!paneVisibility.workshop) setPaneVisible('workshop', true);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-full min-h-0 flex-col">
        <DeferredImportNotice />
        <div className="flex-1 min-h-0">
          {/* Exactly one layout is mounted. Rendering both and hiding one with CSS
          double-mounted every pane: two chat trees (two useChat loops, two
          auto-snapshot policies), duplicate DOM, and 2× re-renders per
          streamed token. */}
          <PaneMosaic Body={PaneBody} />
        </div>
      </div>
      {/* Context menu overlay */}
      <ContextMenu
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onRename={handleRename}
        onDelete={handleDelete}
        onDeleteMultiple={handleDeleteMultiple}
        onDeleteFolder={handleDeleteFolder}
        onOpen={handleOpen}
        onCopyUrl={handleCopyUrl}
        onTranscode={handleTranscode}
        isMediaFile={isMediaFile}
        ffmpegAvailable={ffmpegAvailable}
      />
    </DndProvider>
  );
}
