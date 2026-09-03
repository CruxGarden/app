import { lazy, memo, Suspense, useCallback } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { MosaicWithoutDragDropContext, MosaicWindow } from 'react-mosaic-component';
import type { MosaicBranch, MosaicNode } from 'react-mosaic-component';
import { useUIStore, type PaneType } from '@/stores/uiStore';
import { useStoreProxy } from '@/hooks/useStoreProxy';
import { useIsDesktopLayout } from '@/hooks/useMediaQuery';
import { useNotesManifest } from '@/hooks/useNotesManifest';

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
import { useCruxStore } from '@/stores/cruxStore';
import { Capability, can } from '@/lib/platform';
import { useAppStore } from '@/stores/appStore';
import { getDownloadUrl } from '@/api/public';
import { pathOf, basename, isUnder, displayNameOf } from '@/lib/artifact-path';
import 'react-mosaic-component/react-mosaic-component.css';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { expandTreeSelection } from '@/components/artifacts/treeData';

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

const PANE_LABELS: Record<PaneType, string> = {
  history: 'HISTORY',
  collaboration: 'COLLABORATION',
  artifacts: 'ARTIFACTS',
  workshop: 'WORKSHOP',
  details: 'METADATA',
  sync: 'SYNC',
  publish: 'SHARE',
  export: 'EXPORT',
  store: 'STORE',
};

function MobilePane({ pane }: { pane: PaneType }) {
  const PaneComponent = PANE_COMPONENTS[pane];
  return <PaneComponent />;
}

// ── Pane icons ───────────────────────────────────────────

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const PANE_ICONS: Record<PaneType, React.ReactNode> = {
  history: (
    <svg {...iconProps}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  collaboration: (
    <svg {...iconProps}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  artifacts: (
    <svg {...iconProps}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  workshop: (
    <svg {...iconProps}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  details: (
    <svg {...iconProps}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  sync: (
    <svg {...iconProps}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  publish: (
    <svg {...iconProps}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  export: (
    <svg {...iconProps}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  store: (
    <svg {...iconProps}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
};

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Main layout ─────────────────────────────────────────

export default function WorkspaceLayout() {
  const mosaicLayout = useUIStore((s) => s.mosaicLayout);
  const setMosaicLayout = useUIStore((s) => s.setMosaicLayout);
  const setPaneVisible = useUIStore((s) => s.setPaneVisible);
  const paneVisibility = useUIStore((s) => s.paneVisibility);
  const mobileActivePane = useUIStore((s) => s.mobileActivePane);
  const isDesktopLayout = useIsDesktopLayout();
  const openFile = useUIStore((s) => s.openFile);
  const deleteArtifact = useCruxStore((s) => s.deleteArtifact);
  const deleteArtifacts = useCruxStore((s) => s.deleteArtifacts);
  const artifacts = useCruxStore((s) => s.artifacts);
  const crux = useCruxStore((s) => s.crux);
  const author = useAppStore((s) => s.author);

  // Proxy crux:store:* postMessages from preview iframe to local SQLite
  useStoreProxy(crux?.id ?? null);

  // Auto-generate manifest.json for notes-type cruxes
  useNotesManifest();

  // Context menu handlers
  const handleNewFile = (parentPath: string) => {
    useUIStore.getState().startFileOperation({
      type: 'create-file',
      parentPath,
    });
  };

  const handleNewFolder = (parentPath: string) => {
    useUIStore.getState().startFileOperation({
      type: 'create-folder',
      parentPath,
    });
  };

  const handleRename = (_id: string, path: string) => {
    useUIStore.getState().startFileOperation({
      type: 'rename',
      targetPath: path,
    });
  };

  const handleDelete = async (id: string) => {
    if (
      await confirmDialog({ message: 'Delete this file?', confirmLabel: 'Delete', danger: true })
    ) {
      await deleteArtifact(id);
    }
  };

  const handleDeleteMultiple = async (ids: string[]) => {
    // Selections mix folder virtual ids ("folder:path") with artifact ids.
    const artifactIds = expandTreeSelection(ids, artifacts);
    const count = artifactIds.length;
    if (count === 0) return;
    if (
      await confirmDialog({
        message: `Delete ${count} item${count !== 1 ? 's' : ''}?`,
        confirmLabel: 'Delete',
        danger: true,
      })
    ) {
      await deleteArtifacts(artifactIds);
    }
  };

  const handleDeleteFolder = async (folderPath: string) => {
    const children = artifacts.filter((a) => isUnder(folderPath, pathOf(a)));
    if (children.length === 0) return;
    const folderName = basename(folderPath);
    if (
      await confirmDialog({
        title: 'Delete folder',
        message: `Delete "${folderName}" and ${children.length} file${children.length !== 1 ? 's' : ''}?`,
        confirmLabel: 'Delete',
        danger: true,
      })
    ) {
      await deleteArtifacts(children.map((a) => a.id));
    }
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

        const uploadFile = useCruxStore.getState().uploadFile;
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
    [artifacts],
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
          className={`pane-${paneType}`}
          renderToolbar={() => (
            <div
              className="pane-toolbar"
              style={{
                // shorthand, so a header token may be a gradient
                background: `var(${prefix}-header)`,
                borderColor: `var(${prefix}-header-border)`,
                borderWidth: 1,
                borderStyle: 'solid',
              }}
            >
              <div
                className="flex items-center gap-2"
                style={{ color: `var(${prefix}-header-text)` }}
              >
                <span style={{ color: `var(${prefix}-header-icon)` }}>{PANE_ICONS[paneType]}</span>
                <span className="text-[11px] font-mono uppercase tracking-wider">
                  {PANE_LABELS[paneType]}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPaneVisible(paneType, false);
                }}
                className="p-1 hover:opacity-80 transition-opacity cursor-pointer"
                style={{ color: `var(${prefix}-header-close)` }}
                title={`Close ${PANE_LABELS[paneType]}`}
              >
                <CloseIcon />
              </button>
            </div>
          )}
        >
          <MemoizedPaneContent paneType={paneType} />
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
