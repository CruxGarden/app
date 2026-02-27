import { useState, useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { Attachment } from '@/api/types';
import { getFileIcon, FolderIcon, FolderOpenIcon, ChevronIcon } from './fileIcons';

interface FileTreeProps {
  artifacts: Attachment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, info: { id: string | null; path: string; isFolder: boolean }) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  artifact?: Attachment;
}

function buildTree(artifacts: Attachment[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', children: new Map() };

  for (const a of artifacts) {
    const path = a.meta?.path || a.filename || a.id;
    const parts = path.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath,
          children: new Map(),
          artifact: isFile ? a : undefined,
        });
      } else if (isFile) {
        current.children.get(part)!.artifact = a;
      }

      current = current.children.get(part)!;
    }
  }

  return root;
}

function getSortedChildren(node: TreeNode): TreeNode[] {
  const children = Array.from(node.children.values());
  const dirs = children.filter((c) => c.children.size > 0 && !c.artifact);
  const files = children.filter((c) => c.artifact || c.children.size === 0);
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

function TreeNodeItem({
  node,
  depth,
  selectedId,
  onSelect,
  openDirs,
  toggleDir,
  onContextMenu,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  openDirs: Set<string>;
  toggleDir: (path: string) => void;
  onContextMenu?: (e: React.MouseEvent, info: { id: string | null; path: string; isFolder: boolean }) => void;
}) {
  const isDir = node.children.size > 0 && !node.artifact;
  const isOpen = openDirs.has(node.fullPath);
  const isSelected = node.artifact?.id === selectedId;

  if (isDir) {
    return (
      <>
        <button
          onClick={() => toggleDir(node.fullPath)}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu?.(e, { id: node.artifact?.id ?? null, path: node.fullPath, isFolder: true });
          }}
          className={cn(
            'w-full flex items-center gap-1.5 py-1 text-xs font-mono',
            'transition-colors cursor-pointer text-left',
            'text-text-muted hover:text-text hover:bg-surface',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <ChevronIcon open={isOpen} />
          {isOpen ? <FolderOpenIcon /> : <FolderIcon />}
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen &&
          getSortedChildren(node).map((child) => (
            <TreeNodeItem
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              openDirs={openDirs}
              toggleDir={toggleDir}
              onContextMenu={onContextMenu}
            />
          ))}
      </>
    );
  }

  return (
    <button
      onClick={() => node.artifact && onSelect(node.artifact.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, { id: node.artifact?.id ?? null, path: node.fullPath, isFolder: false });
      }}
      className={cn(
        'w-full flex items-center gap-1.5 py-1 text-xs font-mono',
        'transition-colors cursor-pointer text-left',
        isSelected
          ? 'bg-accent-muted text-accent'
          : 'text-text-muted hover:text-text hover:bg-surface',
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      title={node.fullPath}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export default function FileTree({ artifacts, selectedId, onSelect, onContextMenu }: FileTreeProps) {
  const tree = useMemo(() => buildTree(artifacts), [artifacts]);

  // Collect all directory paths to initialize them as open
  const allDirs = useMemo(() => {
    const dirs = new Set<string>();
    function collect(node: TreeNode) {
      if (node.children.size > 0 && !node.artifact && node.fullPath) {
        dirs.add(node.fullPath);
      }
      node.children.forEach((child) => collect(child));
    }
    collect(tree);
    return dirs;
  }, [tree]);

  const [openDirs, setOpenDirs] = useState<Set<string>>(allDirs);

  const toggleDir = (path: string) => {
    setOpenDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (artifacts.length === 0) {
    return (
      <div className="p-3 text-xs text-text-muted">
        No files yet. Ask the AI to create one.
      </div>
    );
  }

  return (
    <div className="py-1 overflow-y-auto">
      {getSortedChildren(tree).map((child) => (
        <TreeNodeItem
          key={child.fullPath}
          node={child}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          openDirs={openDirs}
          toggleDir={toggleDir}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}
