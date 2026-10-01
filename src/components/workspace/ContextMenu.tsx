import { useEffect, useRef } from 'react';
import { FOLDER_ID_PREFIX } from '@/components/artifacts/treeData';
import { menuItemClass } from '@/components/ui/button-class';
import PlasmaOverlay from '@/components/plasma/PlasmaOverlay';
import { useWorkspaceUIStore as useUIStore } from '@/stores/uiStore';
import { useDismiss } from '@/hooks/useDismiss';
import { AnimatePresence, motion } from 'motion/react';
import { useMotionRole } from '@/hooks/useMotionRole';
import GlassSurface from '@/components/ui/GlassSurface';

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
  onDeleteFolder: (folderPath: string) => void;
  onOpen: (id: string) => void;
  onCopyToCrux?: (ids: string[]) => void;
  onCopyUrl?: (id: string) => void;
  onTranscode?: (id: string) => void;
  isMediaFile?: (id: string) => boolean;
  ffmpegAvailable?: boolean;
}

export default function ContextMenu({
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onDeleteMultiple,
  onDeleteFolder,
  onOpen,
  onCopyUrl,
  onCopyToCrux,
  onTranscode,
  isMediaFile,
  ffmpegAvailable,
}: ContextMenuProps) {
  const contextMenu = useUIStore((s) => s.contextMenu);
  const hideContextMenu = useUIStore((s) => s.hideContextMenu);
  const ref = useRef<HTMLDivElement>(null);
  const role = useMotionRole('dropdown');

  // Close on click outside
  useDismiss(ref, hideContextMenu, contextMenu.visible);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideContextMenu();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [contextMenu.visible, hideContextMenu]);

  const { x, y, targetId, targetPath, isFolder, selectedIds } = contextMenu;
  const isMultiSelect = selectedIds.length > 1;

  const items: MenuItem[] = [];

  const copyIds = isMultiSelect
    ? selectedIds
    : isFolder && targetPath
      ? [`${FOLDER_ID_PREFIX}${targetPath}`]
      : targetId
        ? [targetId]
        : selectedIds;
  if (onCopyToCrux && copyIds.length)
    items.push({
      label: 'Copy to another Crux…',
      action: () => {
        onCopyToCrux(copyIds);
        hideContextMenu();
      },
    });

  // Multi-select actions
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
          label: 'Delete Folder',
          action: () => {
            onDeleteFolder(targetPath);
            hideContextMenu();
          },
          destructive: true,
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
    );
    // Transcode option for media files in Electron
    if (ffmpegAvailable && isMediaFile?.(targetId)) {
      items.push({
        label: 'Transcode for Streaming',
        action: () => {
          onTranscode?.(targetId);
          hideContextMenu();
        },
      });
    }
    items.push(
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
    <AnimatePresence>
      {contextMenu.visible && (
        <motion.div
          key="context-menu"
          ref={ref}
          role="menu"
          data-motion-role="dropdown"
          initial={role.initial}
          animate={role.animate}
          exit={role.exit}
          className="fixed z-50 min-w-[140px]"
          style={{ left: x, top: y }}
          data-plasma-host
        >
          <PlasmaOverlay
            surfaces={[{ ref: panelRef, radius: 12, elevation: 0.6 }]}
            zIndex={45}
            portal
          />
          <GlassSurface role="dropdown">
            <div
              ref={panelRef}
              className="w-full bg-dropdown border border-dropdown-border rounded-dropdown shadow-dropdown p-1 overflow-hidden"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  onClick={item.action}
                  disabled={item.disabled}
                  className={menuItemClass(item.destructive ? 'danger' : 'default', 'text-xs')}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </GlassSurface>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
