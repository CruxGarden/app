import {
  memo,
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Tree, type NodeRendererProps } from 'react-arborist';
import type { TreeApi } from 'react-arborist';
import { cn } from '@/lib/cn';
import type { Attachment } from '@/api/types';
import type { FileOperation } from '@/stores/uiStore';
import { getFileIcon, FolderIcon, FolderOpenIcon, ChevronIcon } from './fileIcons';
import { attachmentsToTreeData, type TreeNodeData } from './treeData';
import InlineRename from '@/components/workspace/InlineRename';

// ── Types ────────────────────────────────────────────────

export interface ArboristFileTreeHandle {
  startRename: (nodeId: string) => void;
  getFocusedFolder: () => string | undefined;
}

type ContextMenuHandler = (
  e: React.MouseEvent,
  info: { id: string | null; path: string; isFolder: boolean },
) => void;

interface ArboristFileTreeProps {
  artifacts: Attachment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu?: ContextMenuHandler;
  onMove?: (id: string, newParentPath: string | null) => void;
  onRename?: (id: string, newName: string) => void;
  onUploadFiles?: (files: File[], parentPath: string | null) => void;
  activeFileOperation?: FileOperation | null;
  onCreateFile?: (name: string) => void;
  onCreateFolder?: (name: string) => void;
  onCancelOperation?: () => void;
  initialOpenState?: Record<string, boolean>;
  onFolderToggle?: (folderId: string, isOpen: boolean) => void;
}

// ── Context for passing handlers to memoized node renderer ──

const TreeContextMenuContext = createContext<ContextMenuHandler | undefined>(undefined);

const SENTINEL_CREATE_ID = '__inline_create__';

interface CreateCallbacks {
  isFolder: boolean;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

const CreateCallbacksContext = createContext<CreateCallbacks | null>(null);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Node renderer (stable component reference) ──────────

const NodeRenderer = memo(function NodeRenderer({ node, style, dragHandle }: NodeRendererProps<TreeNodeData>) {
  const data = node.data;
  const onContextMenu = useContext(TreeContextMenuContext);
  const createCallbacks = useContext(CreateCallbacksContext);

  // Render inline create input for sentinel node
  if (data.id === SENTINEL_CREATE_ID && createCallbacks) {
    return (
      <div
        style={{ ...style, paddingLeft: ((style.paddingLeft as number) || 0) + 8 }}
        className="flex items-center gap-1.5 py-0.5 pr-2 text-xs font-mono"
        onKeyDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {createCallbacks.isFolder ? <FolderIcon /> : <span className="text-text-muted">+</span>}
        <InlineRename initialValue="" onCommit={createCallbacks.onCommit} onCancel={createCallbacks.onCancel} />
      </div>
    );
  }

  const isFolder = node.isInternal;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu?.(e, {
        id: data.attachment?.id ?? null,
        path: data.path,
        isFolder,
      });
    },
    [onContextMenu, data.attachment?.id, data.path, isFolder],
  );

  const fileSize = !isFolder && data.attachment?.size
    ? formatFileSize(Number(data.attachment.size))
    : null;

  return (
    <div
      ref={dragHandle}
      style={{ ...style, paddingLeft: ((style.paddingLeft as number) || 0) + 8 }}
      className={cn(
        'group/node flex items-center gap-1.5 py-0.5 pr-2 text-xs font-mono',
        'cursor-pointer select-none',
        node.isSelected
          ? 'bg-accent-muted text-accent'
          : 'text-text-muted hover:text-text hover:bg-white/[0.06]',
        node.willReceiveDrop && 'bg-accent/10 ring-1 ring-accent/30',
      )}
      onClick={() => node.handleClick}
      onDoubleClick={() => { if (isFolder) node.toggle(); }}
      onContextMenu={handleContextMenu}
      title={fileSize ? `${data.path} (${fileSize})` : data.path}
    >
      {/* Chevron for folders */}
      {isFolder ? (
        <span
          className="flex-shrink-0 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
        >
          <ChevronIcon open={node.isOpen} />
        </span>
      ) : (
        <span className="w-[10px] flex-shrink-0" />
      )}

      {/* Icon */}
      {isFolder ? (
        node.isOpen ? (
          <FolderOpenIcon />
        ) : (
          <FolderIcon />
        )
      ) : (
        getFileIcon(data.name)
      )}

      {/* Name or inline edit */}
      {node.isEditing ? (
        <InlineRename
          initialValue={data.name}
          onCommit={(value) => node.submit(value)}
          onCancel={() => node.reset()}
        />
      ) : (
        <>
          <span className="truncate">{data.name}</span>
          {fileSize && <span className={cn('ml-auto shrink-0 text-[10px] text-text-muted/50 transition-opacity', node.isSelected ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100')}>{fileSize}</span>}
        </>
      )}
    </div>
  );
});

// ── Upload icon ──────────────────────────────────────────

function UploadDropOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent/5 border-2 border-dashed border-accent/40 rounded-[var(--radius)] pointer-events-none">
      <div className="flex flex-col items-center gap-1 text-accent">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-xs font-mono">Drop files here</span>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────

const ArboristFileTree = forwardRef<ArboristFileTreeHandle, ArboristFileTreeProps>(
  function ArboristFileTree(
    {
      artifacts,
      selectedId,
      onSelect,
      onContextMenu,
      onMove,
      onRename,
      onUploadFiles,
      activeFileOperation,
      onCreateFile,
      onCreateFolder,
      onCancelOperation,
      initialOpenState,
      onFolderToggle,
    },
    ref,
  ) {
    const treeRef = useRef<TreeApi<TreeNodeData>>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dndRoot, setDndRoot] = useState<HTMLDivElement | null>(null);
    const [containerHeight, setContainerHeight] = useState(400);
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);

    // Convert flat attachments to tree data
    const treeData = useMemo(
      () => attachmentsToTreeData(artifacts),
      [artifacts],
    );

    // Expose imperative handle
    useImperativeHandle(ref, () => ({
      startRename: (nodeId: string) => {
        treeRef.current?.edit(nodeId);
      },
      getFocusedFolder: () => {
        const node = treeRef.current?.focusedNode;
        if (!node) return undefined;
        if (node.isInternal) return node.data.path;
        if (node.parent && !node.parent.isRoot) return node.parent.data.path;
        return undefined;
      },
    }));

    // Measure container height for react-arborist virtualization
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const observer = new ResizeObserver(([entry]) => {
        if (entry) setContainerHeight(entry.contentRect.height);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    // Sync selection with external state
    useEffect(() => {
      if (selectedId && treeRef.current) {
        const node = treeRef.current.get(selectedId);
        if (node && !node.isSelected) {
          treeRef.current.select(selectedId, { focus: false });
        }
      }
    }, [selectedId]);

    // Watch for rename file operations and trigger tree edit mode
    useEffect(() => {
      if (
        activeFileOperation?.type === 'rename' &&
        activeFileOperation.targetPath &&
        treeRef.current
      ) {
        // Find node by path — could be a file (attachment id) or folder (folder:path)
        const targetPath = activeFileOperation.targetPath;
        // Try file first
        const fileNode = treeData
          .flatMap(function flatten(n: TreeNodeData): TreeNodeData[] {
            return [n, ...(n.children?.flatMap(flatten) ?? [])];
          })
          .find((n) => n.path === targetPath);
        if (fileNode) {
          treeRef.current.edit(fileNode.id);
          onCancelOperation?.();
        }
      }
    }, [activeFileOperation, treeData, onCancelOperation]);

    // ── Handlers ──

    const handleActivate = useCallback(
      (node: { data: TreeNodeData }) => {
        if (node.data.attachment) {
          onSelect(node.data.attachment.id);
        }
      },
      [onSelect],
    );

    const handleMove = useCallback(
      ({
        dragIds,
        parentNode,
      }: {
        dragIds: string[];
        parentId: string | null;
        parentNode: { data: TreeNodeData } | null;
        index: number;
      }) => {
        if (!onMove) return;
        const parentPath = parentNode?.data.path || null;
        for (const id of dragIds) {
          onMove(id, parentPath);
        }
      },
      [onMove],
    );

    const handleRename = useCallback(
      ({ id, name }: { id: string; name: string }) => {
        onRename?.(id, name);
      },
      [onRename],
    );

    const handleToggle = useCallback(
      (id: string) => {
        if (!onFolderToggle) return;
        // onToggle fires after the internal state updates
        const node = treeRef.current?.get(id);
        if (node) onFolderToggle(id, node.isOpen);
      },
      [onFolderToggle],
    );

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        if (!onContextMenu) return;
        // Find the closest tree node from the event target
        const target = e.target as HTMLElement;
        const nodeEl = target.closest('[data-testid]');
        if (nodeEl) return; // Let node-level context menu handle it

        // Right-click on empty space
        e.preventDefault();
        onContextMenu(e, { id: null, path: '', isFolder: false });
      },
      [onContextMenu],
    );

    // ── OS file drop zone ──

    const dragCountRef = useRef(0);

    const handleDragEnter = useCallback(
      (e: React.DragEvent) => {
        if (!onUploadFiles) return;
        if (e.dataTransfer.types.includes('Files')) {
          dragCountRef.current += 1;
          setIsDraggingFiles(true);
        }
      },
      [onUploadFiles],
    );

    const handleDragLeave = useCallback(() => {
      dragCountRef.current -= 1;
      if (dragCountRef.current <= 0) {
        dragCountRef.current = 0;
        setIsDraggingFiles(false);
      }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        dragCountRef.current = 0;
        setIsDraggingFiles(false);

        if (!onUploadFiles) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        // Determine drop target folder
        const focusedNode = treeRef.current?.focusedNode;
        let parentPath: string | null = null;
        if (focusedNode?.isInternal) {
          parentPath = focusedNode.data.path;
        } else if (focusedNode?.parent && !focusedNode.parent.isRoot) {
          parentPath = focusedNode.parent.data.path;
        }

        onUploadFiles(files, parentPath);
      },
      [onUploadFiles],
    );

    // ── Inline create: inject sentinel into tree data ──

    const isCreating =
      activeFileOperation &&
      (activeFileOperation.type === 'create-file' ||
        activeFileOperation.type === 'create-folder');

    const treeDataWithCreate = useMemo(() => {
      if (!isCreating) return treeData;

      const sentinel: TreeNodeData = {
        id: SENTINEL_CREATE_ID,
        name: '',
        path: activeFileOperation!.parentPath
          ? `${activeFileOperation!.parentPath}/__new__`
          : '__new__',
      };

      if (!activeFileOperation!.parentPath) {
        return [...treeData, sentinel];
      }

      const targetFolderId = `folder:${activeFileOperation!.parentPath}`;

      function injectSentinel(nodes: TreeNodeData[]): TreeNodeData[] {
        return nodes.map((node) => {
          if (node.id === targetFolderId) {
            return { ...node, children: [...(node.children || []), sentinel] };
          }
          if (node.children) {
            return { ...node, children: injectSentinel(node.children) };
          }
          return node;
        });
      }

      return injectSentinel(treeData);
    }, [treeData, isCreating, activeFileOperation]);

    const createCallbacks = useMemo<CreateCallbacks | null>(() => {
      if (!isCreating) return null;
      const isFolderOp = activeFileOperation!.type === 'create-folder';
      return {
        isFolder: isFolderOp,
        onCommit: (name: string) =>
          isFolderOp ? onCreateFolder?.(name) : onCreateFile?.(name),
        onCancel: () => onCancelOperation?.(),
      };
    }, [isCreating, activeFileOperation, onCreateFile, onCreateFolder, onCancelOperation]);

    // Auto-open parent folder and scroll to sentinel when creating inside a folder
    useEffect(() => {
      if (isCreating && activeFileOperation?.parentPath && treeRef.current) {
        const folderId = `folder:${activeFileOperation.parentPath}`;
        treeRef.current.open(folderId);
        setTimeout(() => {
          treeRef.current?.scrollTo(SENTINEL_CREATE_ID);
        }, 50);
      }
    }, [isCreating, activeFileOperation]);

    if (artifacts.length === 0 && !isCreating) {
      return (
        <div className="p-3 text-xs text-text-muted">
          No files yet. Ask the AI to create one.
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 flex flex-col"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDraggingFiles && <UploadDropOverlay />}

        {treeDataWithCreate.length > 0 && (
          <div ref={setDndRoot} className="flex-1 min-h-0 pt-2">
            <CreateCallbacksContext.Provider value={createCallbacks}>
              <TreeContextMenuContext.Provider value={onContextMenu}>
                {dndRoot && (
                  <Tree<TreeNodeData>
                    ref={treeRef}
                    data={treeDataWithCreate}
                    width="100%"
                    height={containerHeight}
                    indent={20}
                    rowHeight={26}
                    openByDefault
                    initialOpenState={initialOpenState}
                    selection={selectedId ?? undefined}
                    disableMultiSelection
                    dndRootElement={dndRoot}
                    onActivate={handleActivate}
                    onMove={handleMove}
                    onRename={handleRename}
                    onToggle={handleToggle}
                    onContextMenu={handleContextMenu}
                  >
                    {NodeRenderer}
                  </Tree>
                )}
              </TreeContextMenuContext.Provider>
            </CreateCallbacksContext.Provider>
          </div>
        )}
      </div>
    );
  },
);

export default ArboristFileTree;
