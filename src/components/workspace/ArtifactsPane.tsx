import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { walkEntry } from '@/lib/file-drop';
import { pathOf, basename, parentPath as parentPathOf } from '@/lib/artifact-path';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import ArboristFileTree, {
  type ArboristFileTreeHandle,
  type UploadFileEntry,
} from '@/components/artifacts/ArboristFileTree';
import { FieldRow } from './MetadataContent';
import { formatBytes, formatDateTime } from '@/lib/format';
import { Capability, can } from '@/lib/platform';
import { revealProjectFolder } from '@/services/project-folder';

function RevealIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M10 13l2 2 4-4" />
    </svg>
  );
}

function FolderPlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function FilePlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function CollapseAllIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="14"
      height="14"
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
  );
}

export default function ArtifactsPane() {
  const artifacts = useCruxStore((s) => s.artifacts);
  const cruxId = useCruxStore((s) => s.crux?.id);
  const folderMissing = useCruxStore((s) => s.folderMissing);
  const restoreProjectFolder = useCruxStore((s) => s.restoreProjectFolder);
  const hasProjectFolder = can(Capability.ProjectFolder);
  const createFile = useCruxStore((s) => s.createFile);
  const uploadFiles = useCruxStore((s) => s.uploadFiles);
  const uploadFile = useCruxStore((s) => s.uploadFile);
  const uploadProgress = useCruxStore((s) => s.uploadProgress);
  const moveArtifact = useCruxStore((s) => s.moveArtifact);
  const renameArtifact = useCruxStore((s) => s.renameArtifact);
  const deleteArtifacts = useCruxStore((s) => s.deleteArtifacts);
  const isViewingSnapshot = useCruxStore((s) => s.viewingSnapshotId !== null);
  const openFile = useUIStore((s) => s.openFile);
  const setPaneVisible = useUIStore((s) => s.setPaneVisible);
  const activeTabId = useUIStore((s) => s.editor.activeTabId);
  const startFileOperation = useUIStore((s) => s.startFileOperation);
  const activeFileOperation = useUIStore((s) => s.activeFileOperation);
  const cancelFileOperation = useUIStore((s) => s.cancelFileOperation);
  const showContextMenu = useUIStore((s) => s.showContextMenu);
  const folderOpenState = useUIStore((s) => s.folderOpenState);
  const setFolderOpen = useUIStore((s) => s.setFolderOpen);

  const treeRef = useRef<ArboristFileTreeHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadDropdownRef = useRef<HTMLDivElement>(null);
  const emptyDragCountRef = useRef(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  const [isDraggingOverEmpty, setIsDraggingOverEmpty] = useState(false);

  const selectedArtifact =
    selectedIds.length === 1 ? artifacts.find((a) => a.id === selectedIds[0]) : null;

  // Derive parent folder from tree focus or active tab selection
  const getParentPath = useCallback(() => {
    // Try tree focus first (works when a folder/file is focused in the tree)
    const treeFocused = treeRef.current?.getFocusedFolder();
    if (treeFocused) return treeFocused;

    // Fall back to the selected file's parent folder
    const tabId = useUIStore.getState().editor.activeTabId;
    if (!tabId) return undefined;
    const artifact = useCruxStore.getState().artifacts.find((a) => a.id === tabId);
    if (!artifact) return undefined;
    return parentPathOf(pathOf(artifact)) || undefined;
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      const artifact = useCruxStore.getState().artifacts.find((a) => a.id === id);
      if (!artifact) return;
      const path = pathOf(artifact) || artifact.id;
      openFile(id, path);
      if (!useUIStore.getState().paneVisibility.workshop) setPaneVisible('workshop', true);
    },
    [openFile, setPaneVisible],
  );

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  const handleContextMenu = useCallback(
    (
      e: React.MouseEvent,
      info: { id: string | null; path: string; isFolder: boolean; selectedIds?: string[] },
    ) => {
      e.preventDefault();
      showContextMenu({
        x: e.clientX,
        y: e.clientY,
        targetId: info.id,
        targetPath: info.path,
        isFolder: info.isFolder,
        // Prefer the live selection from the tree node over React state,
        // which may be stale if arborist reset it on mousedown.
        selectedIds: info.selectedIds ?? selectedIds,
      });
    },
    [showContextMenu, selectedIds],
  );

  const handleCreateFile = useCallback(
    async (name: string) => {
      const parentPath = useUIStore.getState().activeFileOperation?.parentPath;
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      cancelFileOperation();
      const newFile = await createFile(fullPath);
      openFile(newFile.id, fullPath);
      if (!useUIStore.getState().paneVisibility.workshop) setPaneVisible('workshop', true);
    },
    [createFile, cancelFileOperation, openFile, setPaneVisible],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      const parentPath = useUIStore.getState().activeFileOperation?.parentPath;
      const folderPath = parentPath ? `${parentPath}/${name}` : name;
      cancelFileOperation();
      const alreadyExists = useCruxStore
        .getState()
        .artifacts.some((a) => pathOf(a).startsWith(folderPath + '/'));
      if (alreadyExists) return;
      await createFile(`${folderPath}/.keep`, '');
    },
    [createFile, cancelFileOperation],
  );

  const handleMove = useCallback(
    async (id: string, newParentPath: string | null) => {
      const { artifacts } = useCruxStore.getState();
      const existingPaths = new Set(artifacts.map((a) => pathOf(a)));

      // If it's a folder (id starts with "folder:"), move all children
      if (id.startsWith('folder:')) {
        const folderPath = id.replace('folder:', '');
        const children = artifacts.filter((a) => pathOf(a).startsWith(folderPath + '/'));
        const folderName = basename(folderPath) || '';
        const destFolderPath = newParentPath ? `${newParentPath}/${folderName}` : folderName;
        const newPaths = children.map((child) => {
          const oldPath = pathOf(child);
          const relativePath = oldPath.slice(folderPath.length);
          return newParentPath
            ? `${newParentPath}/${folderName}${relativePath}`
            : `${folderName}${relativePath}`;
        });
        const destFolderExists =
          destFolderPath !== folderPath &&
          artifacts.some((a) => pathOf(a).startsWith(destFolderPath + '/'));
        const fileConflicts = newPaths.filter(
          (p) => existingPaths.has(p) && !children.some((c) => pathOf(c) === p),
        );
        if (destFolderExists || fileConflicts.length > 0) {
          const msg = destFolderExists
            ? `A folder named "${folderName}" already exists at the destination. Merge contents?`
            : fileConflicts.length === 1
              ? `"${fileConflicts[0]}" already exists. Replace it?`
              : `${fileConflicts.length} files already exist. Replace them?`;
          if (!confirm(msg)) return;
        }
        for (let i = 0; i < children.length; i++) {
          await renameArtifact(children[i]!.id, newPaths[i]!);
        }
      } else {
        const art = artifacts.find((a) => a.id === id);
        if (art) {
          const oldPath = pathOf(art);
          const filename = basename(oldPath) || art.filename;
          const newPath = newParentPath ? `${newParentPath}/${filename}` : filename;
          if (newPath !== oldPath && existingPaths.has(newPath)) {
            if (!confirm(`"${newPath}" already exists. Replace it?`)) return;
          }
        }
        await moveArtifact(id, newParentPath);
      }
    },
    [moveArtifact, renameArtifact],
  );

  const handleRename = useCallback(
    async (id: string, newName: string) => {
      // If it's a folder, batch rename all children
      if (id.startsWith('folder:')) {
        const oldFolderPath = id.replace('folder:', '');
        const parts = oldFolderPath.split('/');
        parts[parts.length - 1] = newName;
        const newFolderPath = parts.join('/');

        const children = useCruxStore
          .getState()
          .artifacts.filter((a) => pathOf(a).startsWith(oldFolderPath + '/'));
        for (const child of children) {
          const oldPath = pathOf(child);
          const newPath = newFolderPath + oldPath.slice(oldFolderPath.length);
          await renameArtifact(child.id, newPath);
        }
      } else {
        // File rename: swap last path segment
        const artifact = useCruxStore.getState().artifacts.find((a) => a.id === id);
        if (!artifact) return;
        const oldPath = pathOf(artifact);
        const pathParts = oldPath.split('/');
        pathParts[pathParts.length - 1] = newName;
        const newPath = pathParts.join('/');
        await renameArtifact(id, newPath);
      }
    },
    [renameArtifact],
  );

  // Close any newly-created folders after an import (folders not yet in saved state
  // would open by default due to openByDefault=true — we want them collapsed).
  const closeFoldersFromPaths = useCallback(
    (paths: string[]) => {
      const current = useUIStore.getState().folderOpenState;
      const toClose = new Set<string>();
      for (const path of paths) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
          const folderId = `folder:${parts.slice(0, i).join('/')}`;
          if (!(folderId in current)) toClose.add(folderId);
        }
      }
      for (const folderId of toClose) setFolderOpen(folderId, false);
    },
    [setFolderOpen],
  );

  const confirmOverwrite = useCallback((entries: { path: string }[]): boolean => {
    const existingPaths = new Set(useCruxStore.getState().artifacts.map((a) => pathOf(a)));
    const conflicts = entries.filter((e) => existingPaths.has(e.path));
    if (conflicts.length === 0) return true;
    const msg =
      conflicts.length === 1
        ? `"${conflicts[0]!.path}" already exists. Replace it?`
        : `${conflicts.length} files already exist. Replace them?`;
    return confirm(msg);
  }, []);

  const handleUploadFiles = useCallback(
    async (files: UploadFileEntry[], parentPath: string | null) => {
      const entries = files.map((f) => ({
        file: f.file,
        path: parentPath ? `${parentPath}/${f.path}` : f.path,
      }));
      if (!confirmOverwrite(entries)) return;
      await uploadFiles(entries);
      closeFoldersFromPaths(entries.map((e) => e.path));
    },
    [uploadFiles, closeFoldersFromPaths, confirmOverwrite],
  );

  const handleDelete = useCallback(
    async (ids: string[]) => {
      const count = ids.length;
      const msg = count === 1 ? 'Delete this file?' : `Delete ${count} items?`;
      if (confirm(msg)) {
        await deleteArtifacts(ids);
      }
    },
    [deleteArtifacts],
  );

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      const parentPath = getParentPath();
      const entries = files.map((f) => ({
        file: f,
        path: parentPath ? `${parentPath}/${f.name}` : f.name,
      }));
      if (!confirmOverwrite(entries)) {
        e.target.value = '';
        return;
      }
      if (entries.length === 1) {
        await uploadFile(entries[0]!.file, parentPath);
      } else {
        await uploadFiles(entries);
      }
      closeFoldersFromPaths(entries.map((en) => en.path));
      e.target.value = '';
    },
    [uploadFile, uploadFiles, getParentPath, closeFoldersFromPaths, confirmOverwrite],
  );

  const handleFolderInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      const parentPath = getParentPath();
      const entries = files.map((f) => ({
        file: f,
        path: parentPath
          ? `${parentPath}/${f.webkitRelativePath || f.name}`
          : f.webkitRelativePath || f.name,
      }));
      if (!confirmOverwrite(entries)) {
        e.target.value = '';
        return;
      }
      await uploadFiles(entries);
      closeFoldersFromPaths(entries.map((en) => en.path));
      e.target.value = '';
    },
    [uploadFiles, getParentPath, closeFoldersFromPaths, confirmOverwrite],
  );

  useEffect(() => {
    if (!uploadMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (uploadDropdownRef.current && !uploadDropdownRef.current.contains(e.target as Node)) {
        setUploadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [uploadMenuOpen]);

  const handleEmptyDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      emptyDragCountRef.current += 1;
      setIsDraggingOverEmpty(true);
    }
  }, []);

  const handleEmptyDragLeave = useCallback(() => {
    emptyDragCountRef.current -= 1;
    if (emptyDragCountRef.current <= 0) {
      emptyDragCountRef.current = 0;
      setIsDraggingOverEmpty(false);
    }
  }, []);

  const handleEmptyDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleEmptyDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      emptyDragCountRef.current = 0;
      setIsDraggingOverEmpty(false);

      const items = Array.from(e.dataTransfer.items);
      const entries = items
        .map((item) => item.webkitGetAsEntry?.())
        .filter((entry): entry is FileSystemEntry => entry != null);

      if (entries.length > 0) {
        const fileEntries: { file: File; path: string }[] = [];
        for (const entry of entries) {
          fileEntries.push(...(await walkEntry(entry, '')));
        }
        if (fileEntries.length > 0) {
          if (!confirmOverwrite(fileEntries)) return;
          await uploadFiles(fileEntries);
          closeFoldersFromPaths(fileEntries.map((e) => e.path));
          return;
        }
      }

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        const fileEntries = files.map((f) => ({ file: f, path: f.name }));
        if (!confirmOverwrite(fileEntries)) return;
        await uploadFiles(fileEntries);
        closeFoldersFromPaths(fileEntries.map((e) => e.path));
      }
    },
    [uploadFiles, closeFoldersFromPaths, confirmOverwrite],
  );

  const actionButtons = (
    <>
      {hasProjectFolder && cruxId && (
        <>
          <div className="relative group/btn">
            <button
              onClick={() => revealProjectFolder(cruxId)}
              className="p-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <RevealIcon />
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none hidden group-hover/btn:block">
              <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-surface-solid border border-border shadow-lg whitespace-nowrap">
                <span className="text-xs font-medium text-text">Reveal in Finder</span>
              </div>
            </div>
          </div>
          <div className="w-px h-3 bg-border mx-0.5" />
        </>
      )}
      <div className="relative group/btn">
        <button
          onClick={() => treeRef.current?.closeAll()}
          className="p-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <CollapseAllIcon />
        </button>
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none hidden group-hover/btn:block">
          <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-surface-solid border border-border shadow-lg whitespace-nowrap">
            <span className="text-xs font-medium text-text">Collapse folders</span>
          </div>
        </div>
      </div>
      <div className="w-px h-3 bg-border mx-0.5" />
      <div className="relative group/btn">
        <button
          onClick={() => {
            startFileOperation({ type: 'create-file', parentPath: getParentPath() });
          }}
          className="p-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <FilePlusIcon />
        </button>
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none hidden group-hover/btn:block">
          <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-surface-solid border border-border shadow-lg whitespace-nowrap">
            <span className="text-xs font-medium text-text">New file</span>
          </div>
        </div>
      </div>
      <div className="relative group/btn">
        <button
          onClick={() => {
            startFileOperation({ type: 'create-folder', parentPath: getParentPath() });
          }}
          className="p-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <FolderPlusIcon />
        </button>
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none hidden group-hover/btn:block">
          <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-surface-solid border border-border shadow-lg whitespace-nowrap">
            <span className="text-xs font-medium text-text">New folder</span>
          </div>
        </div>
      </div>
      <div className="relative" ref={uploadDropdownRef}>
        <button
          onClick={() => setUploadMenuOpen((v) => !v)}
          className="p-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <UploadIcon />
        </button>
        {uploadMenuOpen && (
          <div className="absolute top-full right-0 mt-1 z-50 bg-surface-solid border border-border rounded-[var(--radius-sm)] shadow-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface transition-colors whitespace-nowrap cursor-pointer"
              onClick={() => {
                setUploadMenuOpen(false);
                fileInputRef.current?.click();
              }}
            >
              Files…
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface transition-colors whitespace-nowrap cursor-pointer"
              onClick={() => {
                setUploadMenuOpen(false);
                const el = folderInputRef.current;
                if (el) {
                  el.setAttribute('webkitdirectory', '');
                  el.click();
                }
              }}
            >
              Folder…
            </button>
          </div>
        )}
      </div>
    </>
  );

  const showTree =
    artifacts.length > 0 ||
    (activeFileOperation &&
      (activeFileOperation.type === 'create-file' || activeFileOperation.type === 'create-folder'));

  const totalSize = useMemo(() => {
    const bytes = artifacts.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [artifacts]);

  return (
    <div className="flex flex-col h-full">
      {/* Desktop: registered Project Folder is missing on disk */}
      {folderMissing && (
        <div className="shrink-0 px-3 py-2 border-b border-border bg-error/10 flex items-center justify-between gap-2">
          <span className="text-xs text-text">
            Project folder is missing on disk. Your files are safe in history.
          </span>
          <button
            onClick={() => restoreProjectFolder()}
            className="shrink-0 px-2 py-1 text-xs font-medium rounded-[var(--radius-sm)] bg-accent text-bg hover:opacity-90 transition-opacity cursor-pointer"
          >
            Restore folder
          </button>
        </div>
      )}

      {/* Action toolbar — hidden while viewing a snapshot */}
      {!isViewingSnapshot && (
        <div className="flex items-center justify-end gap-0.5 px-2 py-1 border-b border-border shrink-0 text-text-muted">
          {actionButtons}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={handleFolderInputChange}
      />

      <div
        className="flex-1 overflow-hidden min-h-0 flex flex-col"
        onContextMenu={(e) => {
          e.preventDefault();
          showContextMenu({
            x: e.clientX,
            y: e.clientY,
            targetId: null,
            targetPath: '',
            isFolder: true,
            selectedIds,
          });
        }}
      >
        {showTree ? (
          <ArboristFileTree
            ref={treeRef}
            artifacts={artifacts}
            selectedId={activeTabId}
            onSelect={handleSelect}
            onSelectionChange={handleSelectionChange}
            onContextMenu={handleContextMenu}
            onMove={handleMove}
            onRename={handleRename}
            onUploadFiles={handleUploadFiles}
            onDelete={handleDelete}
            activeFileOperation={activeFileOperation}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onCancelOperation={cancelFileOperation}
            initialOpenState={folderOpenState}
            onFolderToggle={setFolderOpen}
          />
        ) : (
          <div
            className="relative flex-1 flex items-center justify-center"
            onDragEnter={handleEmptyDragEnter}
            onDragLeave={handleEmptyDragLeave}
            onDragOver={handleEmptyDragOver}
            onDrop={handleEmptyDrop}
          >
            {isDraggingOverEmpty ? (
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
                  <span className="text-xs font-mono">Drop files or folders here</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-center text-text-muted">
                Create or import an artifact to get started
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Selected file info ── */}
      {selectedArtifact && (
        <div className="shrink-0 border-t border-border">
          <button
            onClick={() => setFileInfoOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <span className="truncate">{pathOf(selectedArtifact)}</span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 ml-1 transition-transform ${fileInfoOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {fileInfoOpen && (
            <div className="px-3 pb-2 flex flex-col gap-1.5">
              <FieldRow label="Size">
                <span>{formatBytes(selectedArtifact.size)}</span>
              </FieldRow>
              <FieldRow label="Type">
                <span>{selectedArtifact.mimeType}</span>
              </FieldRow>
              <FieldRow label="Created">
                <span>{formatDateTime(selectedArtifact.created)}</span>
              </FieldRow>
              <FieldRow label="Updated">
                <span>{formatDateTime(selectedArtifact.updated)}</span>
              </FieldRow>
            </div>
          )}
        </div>
      )}

      {/* Footer: upload progress or stats */}
      {uploadProgress ? (
        <div className="shrink-0 border-t border-border">
          <div className="px-3 py-1.5 text-[10px] font-mono text-accent flex justify-between">
            <span className="truncate mr-2">
              {uploadProgress.completed + 1}/{uploadProgress.total}: {uploadProgress.currentFile}
            </span>
            <span className="shrink-0">
              {Math.round((uploadProgress.completed / uploadProgress.total) * 100)}%
            </span>
          </div>
          <div className="h-0.5 bg-border">
            <div
              className="h-full bg-accent transition-all duration-200"
              style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : artifacts.length > 0 ? (
        <div className="shrink-0 px-3 py-1.5 border-t border-border text-[10px] font-mono text-text-muted flex justify-between">
          <span>
            {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
          </span>
          <span>{totalSize}</span>
        </div>
      ) : null}
    </div>
  );
}
