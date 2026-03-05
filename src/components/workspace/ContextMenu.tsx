import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useUIStore } from '@/stores/uiStore';

interface MenuItem {
  label: string;
  action: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (id: string, path: string) => void;
  onDelete: (id: string, path: string) => void;
  onDeleteMultiple: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onCopyUrl?: (id: string) => void;
}

export default function ContextMenu({
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onDeleteMultiple,
  onOpen,
  onCopyUrl,
}: ContextMenuProps) {
  const contextMenu = useUIStore((s) => s.contextMenu);
  const hideContextMenu = useUIStore((s) => s.hideContextMenu);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        hideContextMenu();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideContextMenu();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu.visible, hideContextMenu]);

  if (!contextMenu.visible) return null;

  const { x, y, targetId, targetPath, isFolder, selectedIds } = contextMenu;
  const isMultiSelect = selectedIds.length > 1;

  const items: MenuItem[] = [];

  // Multi-select: only show batch delete
  if (isMultiSelect) {
    items.push({
      label: `Delete ${selectedIds.length} items`,
      action: () => {
        onDeleteMultiple(selectedIds);
        hideContextMenu();
      },
      destructive: true,
    });
  } else if (isFolder) {
    items.push(
      {
        label: 'New File',
        action: () => {
          onNewFile(targetPath);
          hideContextMenu();
        },
      },
      {
        label: 'New Folder',
        action: () => {
          onNewFolder(targetPath);
          hideContextMenu();
        },
      },
    );
    if (targetPath) {
      items.push(
        {
          label: 'Rename',
          action: () => {
            if (targetId) {
              onRename(targetId, targetPath);
            }
            hideContextMenu();
          },
          disabled: !targetId,
        },
        {
          label: 'Delete',
          action: () => {
            if (targetId) {
              onDelete(targetId, targetPath);
            }
            hideContextMenu();
          },
          destructive: true,
          disabled: !targetId,
        },
      );
    }
  } else if (targetId) {
    items.push(
      {
        label: 'Open',
        action: () => {
          onOpen(targetId);
          hideContextMenu();
        },
      },
      {
        label: 'Copy URL',
        action: () => {
          onCopyUrl?.(targetId);
          hideContextMenu();
        },
        disabled: !onCopyUrl,
      },
      {
        label: 'Rename',
        action: () => {
          onRename(targetId, targetPath);
          hideContextMenu();
        },
      },
      {
        label: 'Delete',
        action: () => {
          onDelete(targetId, targetPath);
          hideContextMenu();
        },
        destructive: true,
      },
    );
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[140px] bg-surface-solid border border-border rounded-[var(--radius-sm)] shadow-lg py-1 overflow-hidden"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.action}
          disabled={item.disabled}
          className={cn(
            'w-full text-left px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            item.destructive
              ? 'text-error hover:bg-error-muted'
              : 'text-text hover:bg-accent-muted/20',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
