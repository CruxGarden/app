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
}

// ── Context for passing handlers to memoized node renderer ──

const TreeContextMenuContext = createContext<ContextMenuHandler | undefined>(undefined);

// ── Node renderer (stable component reference) ──────────

const NodeRenderer = memo(function NodeRenderer({ node, style, dragHandle }: NodeRendererProps<TreeNodeData>) {
  const isFolder = node.isInternal;
  const data = node.data;
  const onContextMenu = useContext(TreeContextMenuContext);

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

  return (
    <div
      ref={dragHandle}
      style={style}
      className={cn(
        'flex items-center gap-1.5 py-0.5 pr-2 text-xs font-mono',
        'cursor-pointer select-none',
        node.isSelected
          ? 'bg-accent-muted text-accent'
          : 'text-text-muted hover:text-text hover:bg-surface',
        node.willReceiveDrop && 'bg-accent/10 ring-1 ring-accent/30',
      )}
      onClick={() => node.handleClick}
      onContextMenu={handleContextMenu}
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
        <span className="truncate">{data.name}</span>
      )}
    </div>
  );
});

// ── Inline create row ────────────────────────────────────

function InlineCreateRow({
  indent,
  isFolder,
  onCommit,
  onCancel,
}: {
  indent: number;
  isFolder: boolean;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 py-1 text-xs font-mono"
      style={{ paddingLeft: `${indent}px` }}
    >
      {isFolder ? <FolderIcon /> : <span className="text-text-muted">+</span>}
      <InlineRename initialValue="" onCommit={onCommit} onCancel={onCancel} />
    </div>
  );
}

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
    },
    ref,
  ) {
    const treeRef = useRef<TreeApi<TreeNodeData>>(null);
    const containerRef = useRef<HTMLDivElement>(null);
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

    // Check if creating at root level
    const isCreatingAtRoot =
      activeFileOperation &&
      (activeFileOperation.type === 'create-file' ||
        activeFileOperation.type === 'create-folder') &&
      !activeFileOperation.parentPath;

    // Check if creating inside a folder
    const isCreatingInFolder =
      activeFileOperation &&
      (activeFileOperation.type === 'create-file' ||
        activeFileOperation.type === 'create-folder') &&
      activeFileOperation.parentPath;

    // Calculate indent for inline create rows
    const createIndent = isCreatingInFolder
      ? (activeFileOperation.parentPath!.split('/').length + 1) * 20
      : 20;

    const isCreating = isCreatingAtRoot || isCreatingInFolder;
    const INLINE_ROW_HEIGHT = 30;
    const treeHeight = isCreating
      ? Math.max(containerHeight - INLINE_ROW_HEIGHT, 0)
      : containerHeight;

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

        {treeData.length > 0 && (
          <div className="flex-1 min-h-0">
            <TreeContextMenuContext.Provider value={onContextMenu}>
              <Tree<TreeNodeData>
                ref={treeRef}
                data={treeData}
                width="100%"
                height={treeHeight}
                indent={20}
                rowHeight={26}
                openByDefault
                selection={selectedId ?? undefined}
                disableMultiSelection
                onActivate={handleActivate}
                onMove={handleMove}
                onRename={handleRename}
                onContextMenu={handleContextMenu}
              >
                {NodeRenderer}
              </Tree>
            </TreeContextMenuContext.Provider>
          </div>
        )}

        {/* Inline create inside folder */}
        {isCreatingInFolder && (
          <InlineCreateRow
            indent={createIndent}
            isFolder={activeFileOperation.type === 'create-folder'}
            onCommit={(name) =>
              activeFileOperation.type === 'create-folder'
                ? onCreateFolder?.(name)
                : onCreateFile?.(name)
            }
            onCancel={() => onCancelOperation?.()}
          />
        )}

        {/* Inline create at root */}
        {isCreatingAtRoot && (
          <InlineCreateRow
            indent={20}
            isFolder={activeFileOperation.type === 'create-folder'}
            onCommit={(name) =>
              activeFileOperation.type === 'create-folder'
                ? onCreateFolder?.(name)
                : onCreateFile?.(name)
            }
            onCancel={() => onCancelOperation?.()}
          />
        )}
      </div>
    );
  },
);

export default ArboristFileTree;
