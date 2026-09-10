import { useWorkspaceUIStoreApi } from '@/stores/uiStore';
import { copyIdentity } from '@/services/working-copies';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { lazy, memo, Suspense, useCallback, type CSSProperties } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { MosaicWithoutDragDropContext, MosaicWindow } from 'react-mosaic-component';
import type { MosaicBranch, MosaicNode } from 'react-mosaic-component';
import { PaneEmpty } from './pane-ui';
import { usePaneWidth } from '@/hooks/usePaneWidth';
import { Spinner } from '@/components/ui';
import { useWorkspaceUIStore as useUIStore, type PaneType } from '@/stores/uiStore';
import { useStoreProxy } from '@/hooks/useStoreProxy';
import { useIsDesktopLayout } from '@/hooks/useMediaQuery';

const HistoryPane = lazy(() => import('./HistoryPane'));
const ChatPane = lazy(() => import('./ChatPane'));
const ArtifactsPane = lazy(() => import('./ArtifactsPane'));
const EditorPane = lazy(() => import('./EditorPane'));
const MetadataPane = lazy(() => import('./MetadataPane'));
const SyncPane = lazy(() => import('./SyncPane'));
const PublishPane = lazy(() => import('./PublishPane'));
const ExportPane = lazy(() => import('./ExportPane'));
const StorePane = lazy(() => import('./StorePane'));
import ContextMenu from './ContextMenu';
import MobilePaneSwitcher from './MobilePaneSwitcher';
import {
  ActivityIcon,
  ChatIcon,
  CloseIcon,
  CodeIcon,
  ExportIcon,
  FolderIcon,
  RefreshIcon,
  RepeatIcon,
  StoreIcon,
  TagIcon,
} from '@/components/ui/icons';
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
  history: HistoryPane,
  collaboration: ChatPane,
  artifacts: ArtifactsPane,
  workshop: EditorPane,
  details: MetadataPane,
  sync: SyncPane,
  publish: PublishPane,
  export: ExportPane,
  store: StorePane,
};

// Memoized pane content — prevents React from re-diffing heavy subtrees
// (Monaco, chat, file tree) when only mosaic split percentages change
/**
 * The least width each pane makes sense in. Below it the pane says so instead
 * of squeezing its controls (the Share pane set the pattern); each has its own
 * number — a file tree lives in less than a conversation does.
 */
const PANE_MIN_WIDTH: Record<PaneType, number> = {
  collaboration: 260,
  artifacts: 160,
  workshop: 280,
  details: 220,
  history: 200,
  export: 200,
  sync: 200,
  publish: 270,
  store: 280,
};

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
 * What sits inside a tile: the pane, once the crux has loaded and the tile is
 * wide enough — otherwise a word about why not. Empty frames with nothing in
 * them read as broken (Daniel, 2026-09-07: a slow first open after a restart).
 */
function PaneBody({ paneType }: { paneType: PaneType }) {
  const loaded = useCruxStore((s) => !!s.crux);
  const copy = useCruxStore((s) => copyIdentity(s.crux));
  const { ref, isTooNarrow } = usePaneWidth(PANE_MIN_WIDTH[paneType]);
  return (
    <div ref={ref} className="h-full min-h-0 flex flex-col" data-testid={`pane-body-${paneType}`}>
      {copy && ['publish', 'sync', 'details', 'export'].includes(paneType) ? (
        <PaneEmpty
          title="Available in Main"
          description="Open Main to manage the Crux’s details, publishing and complete backup."
        />
      ) : !loaded ? (
        <PaneEmpty
          icon={<Spinner size={16} />}
          title="Opening…"
          description={`${PANE_LABELS[paneType]} appears as soon as the crux has loaded.`}
          className="h-full"
        />
      ) : isTooNarrow ? (
        <PaneEmpty
          title="Widen the pane"
          description={`${PANE_LABELS[paneType]} needs a little more room to show its contents.`}
          className="h-full"
        />
      ) : (
        <MemoizedPaneContent paneType={paneType} />
      )}
    </div>
  );
}

// Title case here; the Mood decides the rendered case (--pane-header-label-case,
// uppercase by default), so a theme can ask for "Collaboration" or "collaboration".
const PANE_LABELS: Record<PaneType, string> = {
  history: 'History',
  collaboration: 'Collaboration',
  artifacts: 'Artifacts',
  workshop: 'Workshop',
  details: 'Metadata',
  sync: 'Sync',
  publish: 'Share',
  export: 'Export',
  store: 'Store',
};

function MobilePane({ pane }: { pane: PaneType }) {
  const PaneComponent = PANE_COMPONENTS[pane];
  return <PaneComponent />;
}

// ── Pane icons ───────────────────────────────────────────

// Header glyphs come from the icon module so the Mood's iconSet (line | filled | pixel) applies.
const PANE_ICONS: Record<PaneType, React.ReactNode> = {
  history: <ActivityIcon size={14} strokeWidth={2} />,
  collaboration: <ChatIcon size={14} strokeWidth={2} />,
  artifacts: <FolderIcon size={14} strokeWidth={2} />,
  workshop: <CodeIcon size={14} strokeWidth={2} />,
  details: <TagIcon size={14} strokeWidth={2} />,
  sync: <RefreshIcon size={14} strokeWidth={2} />,
  publish: <RepeatIcon size={14} strokeWidth={2} />,
  export: <ExportIcon size={14} strokeWidth={2} />,
  store: <StoreIcon size={14} strokeWidth={2} />,
};

// ── Main layout ─────────────────────────────────────────

export default function WorkspaceLayout() {
  const cruxStore = useCruxStoreApi();
  const uiStore = useWorkspaceUIStoreApi();
  const mosaicLayout = useUIStore((s) => s.mosaicLayout);
  const setMosaicLayout = useUIStore((s) => s.setMosaicLayout);
  const setPaneVisible = useUIStore((s) => s.setPaneVisible);
  const paneVisibility = useUIStore((s) => s.paneVisibility);
  const mobileActivePane = useUIStore((s) => s.mobileActivePane);
  const isDesktopLayout = useIsDesktopLayout();
  const openFile = useUIStore((s) => s.openFile);
  const artifacts = useCruxStore((s) => s.artifacts);
  const crux = useCruxStore((s) => s.crux);
  const author = useAppStore((s) => s.author);

  // Proxy crux:store:* postMessages from preview iframe to local SQLite
  useStoreProxy(crux?.id ?? null);

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
      const prefix = {
        collaboration: '--pane-collaboration',
        artifacts: '--pane-artifacts',
        workshop: '--pane-workshop',
        details: '--pane-details',
        history: '--pane-history',
        export: '--pane-export',
        sync: '--pane-sync',
        publish: '--pane-publish',
        store: '--pane-store',
      }[paneType];

      return (
        <MosaicWindow<PaneType>
          path={path}
          title={PANE_LABELS[paneType]}
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
                } as CSSProperties
              }
            >
              <div
                className="flex items-center gap-2"
                style={{ color: `var(${prefix}-header-text)` }}
              >
                <span className="pane-toolbar-icon" style={{ color: `var(${prefix}-header-icon)` }}>
                  {PANE_ICONS[paneType]}
                </span>
                <span className="pane-toolbar-label">{PANE_LABELS[paneType]}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPaneVisible(paneType, false);
                }}
                className="pane-toolbar-close p-1 hover:opacity-80 transition-opacity cursor-pointer"
                style={{ color: `var(${prefix}-header-close)` }}
                title={`Close ${PANE_LABELS[paneType]}`}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          )}
        >
          <PaneBody paneType={paneType} />
        </MosaicWindow>
      );
    },
    [setPaneVisible],
  );

  return (
    <DndProvider backend={HTML5Backend}>
      {/* Exactly one layout is mounted. Rendering both and hiding one with CSS
          double-mounted every pane: two chat trees (two useChat loops, two
          auto-snapshot policies), duplicate DOM, and 2× re-renders per
          streamed token. */}
      {isDesktopLayout ? (
        <div className="h-full min-h-0">
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
      )}

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
