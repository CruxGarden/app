import { Fragment, useCallback, useMemo } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { cn } from '@/lib/cn';
import { Panel as UIPanel } from '@/components/ui';
import { useUIStore, type PaneType } from '@/stores/uiStore';
import { DragProvider } from './DragContext';
import { usePaneDrag } from './DragContext';
import NavigationPane from './NavigationPane';
import ChatPane from './ChatPane';
import ArtifactsPane from './ArtifactsPane';
import EditorPane from './EditorPane';
import MetadataPane from './MetadataPane';
import SyncPane from './SyncPane';
import PublishPane from './PublishPane';
import ExportPane from './ExportPane';
import ContextMenu from './ContextMenu';
import MobilePaneSwitcher from './MobilePaneSwitcher';
import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import { getDownloadUrl } from '@/api/public';

// ── Pane configuration ──────────────────────────────────

interface PaneConfig {
  minSize: number;
  defaultSize: number;
  collapsible: boolean;
}

const PANE_CONFIG: Record<PaneType, PaneConfig> = {
  history:       { minSize: 10, defaultSize: 18, collapsible: true },
  collaboration: { minSize: 20, defaultSize: 40, collapsible: false },
  artifacts:     { minSize: 10, defaultSize: 16, collapsible: true },
  workshop:      { minSize: 15, defaultSize: 26, collapsible: true },
  details:       { minSize: 10, defaultSize: 16, collapsible: true },
  sync:          { minSize: 10, defaultSize: 16, collapsible: true },
  publish:       { minSize: 10, defaultSize: 16, collapsible: true },
  export:        { minSize: 10, defaultSize: 16, collapsible: true },
};

const PANE_COMPONENTS: Record<PaneType, React.ComponentType> = {
  history: NavigationPane,
  collaboration: ChatPane,
  artifacts: ArtifactsPane,
  workshop: EditorPane,
  details: MetadataPane,
  sync: SyncPane,
  publish: PublishPane,
  export: ExportPane,
};

// ── Resize handle ───────────────────────────────────────

function ResizeHandle() {
  return (
    <Separator
      className={cn(
        'w-[3px] bg-transparent hover:bg-accent/30 active:bg-accent/50',
        'transition-colors duration-150 cursor-col-resize',
        'relative group/handle flex-shrink-0',
      )}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-8 rounded-full bg-border opacity-0 group-hover/handle:opacity-100 group-hover/handle:bg-accent/40 transition-opacity" />
    </Separator>
  );
}

// ── Draggable pane wrapper (drop zone) ──────────────────

function DraggablePane({ paneType, children }: { paneType: PaneType; children: React.ReactNode }) {
  const { dragSource, setDropTarget, endDrag } = usePaneDrag();
  const isDragging = dragSource === paneType;

  return (
    <div
      className={cn('h-full border border-accent/20 rounded-[var(--radius-sm)] group/pane', isDragging && 'opacity-50')}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(paneType);
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => {
        e.preventDefault();
        endDrag();
      }}
    >
      {children}
    </div>
  );
}

// ── Main layout ─────────────────────────────────────────

export default function WorkspaceLayout() {
  const paneOrder = useUIStore((s) => s.paneOrder);
  const paneVisibility = useUIStore((s) => s.paneVisibility);
  const reorderPanes = useUIStore((s) => s.reorderPanes);
  const setPaneVisible = useUIStore((s) => s.setPaneVisible);
  const mobileActivePane = useUIStore((s) => s.mobileActivePane);
  const openFile = useUIStore((s) => s.openFile);
  const deleteArtifact = useCruxStore((s) => s.deleteArtifact);
  const artifacts = useCruxStore((s) => s.artifacts);
  const crux = useCruxStore((s) => s.crux);
  const author = useAuthStore((s) => s.author);

  // Visible panes in order
  const visiblePanes = useMemo(
    () => paneOrder.filter((p) => paneVisibility[p]),
    [paneOrder, paneVisibility],
  );

  // Panel ids for layout persistence
  const panelIds = useMemo(() => visiblePanes.map(String), [visiblePanes]);

  // Persist layout across page reloads
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'cruxgarden-workspace',
    panelIds,
    storage: localStorage,
  });

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
    if (confirm('Delete this file?')) {
      await deleteArtifact(id);
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

  const handleOpen = (id: string) => {
    const artifact = artifacts.find((a) => a.id === id);
    if (!artifact) return;
    const path = artifact.meta?.path || artifact.filename || artifact.id;
    openFile(id, path);
    if (!paneVisibility.workshop) setPaneVisible('workshop', true);
  };

  const handleReorder = useCallback(
    (source: PaneType, target: PaneType) => {
      const order = [...paneOrder];
      const srcIdx = order.indexOf(source);
      const tgtIdx = order.indexOf(target);
      if (srcIdx === -1 || tgtIdx === -1) return;
      order.splice(srcIdx, 1);
      order.splice(tgtIdx, 0, source);
      reorderPanes(order);
    },
    [paneOrder, reorderPanes],
  );

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:flex h-full min-h-0">
        {visiblePanes.length > 0 ? (
          <DragProvider onReorder={handleReorder}>
            <Group
              orientation="horizontal"
              defaultLayout={defaultLayout}
              onLayoutChanged={onLayoutChanged}
            >
              {visiblePanes.map((paneType, i) => {
                const config = PANE_CONFIG[paneType];
                const PaneComponent = PANE_COMPONENTS[paneType];

                return (
                  <Fragment key={paneType}>
                    {i > 0 && <ResizeHandle />}
                    <Panel
                      id={paneType}
                      minSize={config.minSize}
                      defaultSize={config.defaultSize}
                      collapsible={config.collapsible}
                      className="bg-surface-solid"
                    >
                      <DraggablePane paneType={paneType}>
                        <PaneComponent />
                      </DraggablePane>
                    </Panel>
                  </Fragment>
                );
              })}
            </Group>
          </DragProvider>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <UIPanel padding="md" className="text-text-muted text-xs font-mono text-center">
              Toggle a pane from the toolbar to proceed
            </UIPanel>
          </div>
        )}
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden flex-col h-full min-h-0">
        <div className="flex-1 min-h-0 group/pane">
          {(() => {
            const PaneComponent = PANE_COMPONENTS[mobileActivePane];
            return <PaneComponent />;
          })()}
        </div>
        <MobilePaneSwitcher />
      </div>

      {/* Context menu overlay */}
      <ContextMenu
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onRename={handleRename}
        onDelete={handleDelete}
        onOpen={handleOpen}
        onCopyUrl={handleCopyUrl}
      />
    </>
  );
}
