import type { Artifact } from '@/api/types';
import type { ArtifactUploadEntry } from '@/services/types';
import CopyArtifactsDialog, { type ArtifactCopySelection } from './CopyArtifactsDialog';
import { captureGardenId } from '@/stores/gardenContext';
import { useWorkspaceUIStoreApi } from '@/stores/uiStore';
import PlasmaOverlay from '@/components/plasma/PlasmaOverlay';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { walkEntry } from '@/lib/file-drop';
import {
  isUnder,
  pathOf,
  basename,
  parentPath as parentPathOf,
  isAgentFile,
} from '@/lib/artifact-path';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useCruxStore } from '@/stores/cruxStore';
import { useWorkspaceUIStore as useUIStore } from '@/stores/uiStore';
import ArboristFileTree, {
  type ArboristFileTreeHandle,
  type UploadFileEntry,
} from '@/components/artifacts/ArboristFileTree';
import { FieldRow } from './MetadataContent';
import { formatBytes, formatDateTime } from '@/lib/format';
import { Capability, can } from '@/lib/platform';
import { revealProjectFolder } from '@/services/project-folder';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { confirmAndDeleteArtifacts } from '@/components/artifacts/safeDelete';
import { reportFileUpdateError } from '@/components/artifacts/fileUpdateError';
import { expandTreeSelection, FOLDER_ID_PREFIX } from '@/components/artifacts/treeData';
import ConvertActions from '@/components/artifacts/ConvertActions';
import FindInFiles from '@/components/artifacts/FindInFiles';
import type { FindFileResult, FindMatch } from '@/services/find-in-files';
import { requestEditorReveal } from './editor-reveal';
import IconButton from '@/components/ui/IconButton';
import { buttonClass, menuItemClass } from '@/components/ui/button-class';

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
  const cruxStore = useCruxStoreApi();
  const uiStore = useWorkspaceUIStoreApi();
  const allArtifacts = useCruxStore((s) => s.artifacts);
  // The agent guides (AGENTS.md, CLAUDE.md) are the collaborator's plumbing:
  // folded away unless asked for, and never shown with AI off.
  const aiEnabled = useAiEnabled();
  const [showAgentFiles, setShowAgentFiles] = useState(false);
  const artifacts = useMemo(
    () =>
      aiEnabled && showAgentFiles
        ? allArtifacts
        : allArtifacts.filter((a) => !isAgentFile(pathOf(a))),
    [allArtifacts, aiEnabled, showAgentFiles],
  );
  const agentFileCount = useMemo(
    () => allArtifacts.filter((a) => isAgentFile(pathOf(a))).length,
    [allArtifacts],
  );
  const cruxId = useCruxStore((s) => s.crux?.id);
  const folderMissing = useCruxStore((s) => s.folderMissing);
  const restoreProjectFolder = useCruxStore((s) => s.restoreProjectFolder);
  const hasProjectFolder = can(Capability.ProjectFolder);
  const createFile = useCruxStore((s) => s.createFile);
  const uploadFiles = useCruxStore((s) => s.uploadFiles);
  const uploadProgress = useCruxStore((s) => s.uploadProgress);
  const renameArtifact = useCruxStore((s) => s.renameArtifact);
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
  const [copySelection, setCopySelection] = useState<ArtifactCopySelection | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
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
    const tabId = uiStore.getState().editor.activeTabId;
    if (!tabId) return undefined;
    const artifact = cruxStore.getState().artifacts.find((a) => a.id === tabId);
    if (!artifact) return undefined;
    return parentPathOf(pathOf(artifact)) || undefined;
  }, [cruxStore, uiStore]);

  const handleSelect = useCallback(
    (id: string) => {
      const artifact = cruxStore.getState().artifacts.find((a) => a.id === id);
      if (!artifact) return;
      const path = pathOf(artifact) || artifact.id;
      openFile(id, path);
      if (!uiStore.getState().paneVisibility.workshop) setPaneVisible('workshop', true);
    },
    [cruxStore, openFile, setPaneVisible, uiStore],
  );

  // A find-in-files result: the file's source, at that line, the match selected.
  const handleOpenMatch = useCallback(
    (file: FindFileResult, match: FindMatch) => {
      requestEditorReveal(file.id, match);
      openFile(file.id, file.path);
      uiStore.getState().setTabViewMode(file.id, 'source');
      if (!uiStore.getState().paneVisibility.workshop) setPaneVisible('workshop', true);
    },
    [openFile, setPaneVisible, uiStore],
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
      const parentPath = uiStore.getState().activeFileOperation?.parentPath;
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      cancelFileOperation();
      const newFile = await createFile(fullPath);
      openFile(newFile.id, fullPath);
      if (!uiStore.getState().paneVisibility.workshop) setPaneVisible('workshop', true);
    },
    [uiStore, cancelFileOperation, createFile, openFile, setPaneVisible],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      const parentPath = uiStore.getState().activeFileOperation?.parentPath;
      const folderPath = parentPath ? `${parentPath}/${name}` : name;
      cancelFileOperation();
      const alreadyExists = cruxStore
        .getState()
        .artifacts.some((a) => pathOf(a).startsWith(folderPath + '/'));
      if (alreadyExists) return;
      await createFile(`${folderPath}/.keep`, '');
    },
    [uiStore, cancelFileOperation, cruxStore, createFile],
  );

  const renameSelection = useCallback(
    async (
      moves: { source: Artifact; path: string }[],
      artifacts: Artifact[],
      mergeMessage?: string,
    ) => {
      const captured = moves
        .filter(({ source, path }) => pathOf(source) !== path)
        .map(({ source, path }) => ({
          source: structuredClone(source),
          path,
          target: structuredClone(
            artifacts.find((file) => pathOf(file) === path && file.id !== source.id) ?? null,
          ),
        }));
      if (!captured.length) return;
      const conflicts = captured.filter((move) => move.target);
      if (
        (conflicts.length || mergeMessage) &&
        !(await confirmDialog({
          message:
            mergeMessage ??
            (conflicts.length === 1
              ? `"${conflicts[0]!.path}" already exists. Replace it?`
              : `${conflicts.length} files already exist. Replace them?`),
          confirmLabel: 'Replace',
          danger: true,
        }))
      )
        return;
      let completed = 0;
      try {
        for (const move of captured) {
          if (cruxStore.getState().crux?.id !== move.source.resourceId)
            throw new Error('The active Crux changed. Return to the original Crux to continue.');
          await renameArtifact(move.source.id, move.path, {
            source: move.source,
            target: move.target,
          });
          completed++;
        }
      } catch (error) {
        const remaining = captured.length - completed - 1;
        await reportFileUpdateError(cruxStore, error, {
          title: 'Rename failed',
          fallback: 'Could not rename these files.',
          message: `${completed ? `${completed} files were renamed. ` : ''}${error instanceof Error ? error.message : String(error)}${remaining ? ` ${remaining} remaining files were not renamed. Select them again to retry.` : ''}`,
        });
      }
    },
    [cruxStore, renameArtifact],
  );

  const handleMove = useCallback(
    async (id: string, newParentPath: string | null) => {
      const artifacts = cruxStore.getState().artifacts;
      if (id.startsWith(FOLDER_ID_PREFIX)) {
        const folder = id.slice(FOLDER_ID_PREFIX.length);
        const destination = newParentPath
          ? `${newParentPath}/${basename(folder)}`
          : basename(folder);
        await renameSelection(
          artifacts
            .filter((file) => isUnder(folder, pathOf(file)))
            .map((source) => ({ source, path: destination + pathOf(source).slice(folder.length) })),
          artifacts,
          destination !== folder &&
            artifacts.some((file) => pathOf(file).startsWith(destination + '/'))
            ? `A folder named "${basename(folder)}" already exists at the destination. Merge contents?`
            : undefined,
        );
      } else {
        const source = artifacts.find((file) => file.id === id);
        if (source)
          await renameSelection(
            [
              {
                source,
                path: newParentPath
                  ? `${newParentPath}/${basename(pathOf(source))}`
                  : pathOf(source).split('/').pop()!,
              },
            ],
            artifacts,
          );
      }
    },
    [cruxStore, renameSelection],
  );

  const handleRename = useCallback(
    async (id: string, newName: string) => {
      const artifacts = cruxStore.getState().artifacts;
      if (id.startsWith(FOLDER_ID_PREFIX)) {
        const folder = id.slice(FOLDER_ID_PREFIX.length);
        const parts = folder.split('/');
        parts[parts.length - 1] = newName;
        await renameSelection(
          artifacts
            .filter((file) => isUnder(folder, pathOf(file)))
            .map((source) => ({
              source,
              path: parts.join('/') + pathOf(source).slice(folder.length),
            })),
          artifacts,
        );
      } else {
        const source = artifacts.find((file) => file.id === id);
        if (!source) return;
        const parts = pathOf(source).split('/');
        parts[parts.length - 1] = newName;
        await renameSelection([{ source, path: parts.join('/') }], artifacts);
      }
    },
    [cruxStore, renameSelection],
  );

  // Close any newly-created folders after an import (folders not yet in saved state
  // would open by default due to openByDefault=true — we want them collapsed).
  const closeFoldersFromPaths = useCallback(
    (paths: string[]) => {
      const current = uiStore.getState().folderOpenState;
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
    [setFolderOpen, uiStore],
  );

  const confirmOverwrite = useCallback(async (entries: ArtifactUploadEntry[]): Promise<boolean> => {
    const conflicts = entries.filter((entry) => entry.expected !== null);
    if (conflicts.length === 0) return true;
    const msg =
      conflicts.length === 1
        ? `"${conflicts[0]!.path}" already exists. Replace it?`
        : `${conflicts.length} files already exist. Replace them?`;
    return confirmDialog({ message: msg, confirmLabel: 'Replace' });
  }, []);

  const uploadEntries = useCallback(
    async (entries: UploadFileEntry[], ownerId = cruxStore.getState().crux?.id): Promise<void> => {
      try {
        const current = new Map(cruxStore.getState().artifacts.map((file) => [pathOf(file), file]));
        const selection = entries.map(({ file, path }) => ({
          file,
          path,
          expected: structuredClone(current.get(path) ?? null),
        }));
        if (!(await confirmOverwrite(selection))) return;
        if (cruxStore.getState().crux?.id !== ownerId)
          throw new Error('The active Crux changed. Choose the files again in their destination.');
        await uploadFiles(selection);
        closeFoldersFromPaths(selection.map((entry) => entry.path));
      } catch (error) {
        await reportFileUpdateError(cruxStore, error, {
          title: 'Upload failed',
          fallback: 'Could not add these files. Choose them again to retry.',
        });
      }
    },
    [cruxStore, confirmOverwrite, uploadFiles, closeFoldersFromPaths],
  );

  const handleUploadFiles = useCallback(
    async (files: UploadFileEntry[], parentPath: string | null) => {
      const entries = files.map((f) => ({
        file: f.file,
        path: parentPath ? `${parentPath}/${f.path}` : f.path,
      }));
      await uploadEntries(entries);
    },
    [uploadEntries],
  );

  const handleDelete = useCallback(
    async (ids: string[]) => {
      // Keyboard Delete hands us raw tree selection — folders arrive as
      // "folder:path" ids and used to be silently skipped by deleteArtifacts.
      const artifactIds = expandTreeSelection(ids, cruxStore.getState().artifacts);
      const count = artifactIds.length;
      if (count === 0) return;
      const folders = ids.filter((id) => id.startsWith(FOLDER_ID_PREFIX)).length;
      const msg =
        folders === 1 && ids.length === 1
          ? `Delete this folder and its ${count} file${count !== 1 ? 's' : ''}?`
          : ids.length === 1
            ? 'Delete this file?'
            : `Delete ${ids.length} items (${count} file${count !== 1 ? 's' : ''})?`;
      await confirmAndDeleteArtifacts(cruxStore, artifactIds, msg);
    },
    [cruxStore],
  );

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.currentTarget.files || []);
      e.currentTarget.value = '';
      if (files.length === 0) return;
      const parentPath = getParentPath();
      const entries = files.map((f) => ({
        file: f,
        path: parentPath ? `${parentPath}/${f.name}` : f.name,
      }));
      await uploadEntries(entries);
    },
    [uploadEntries, getParentPath],
  );

  const handleFolderInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.currentTarget.files || []);
      e.currentTarget.value = '';
      if (files.length === 0) return;
      const parentPath = getParentPath();
      const entries = files.map((f) => ({
        file: f,
        path: parentPath
          ? `${parentPath}/${f.webkitRelativePath || f.name}`
          : f.webkitRelativePath || f.name,
      }));
      await uploadEntries(entries);
    },
    [uploadEntries, getParentPath],
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
      const ownerId = cruxStore.getState().crux?.id;
      const files = Array.from(e.dataTransfer.files);
      try {
        const entries = Array.from(e.dataTransfer.items)
          .map((item) => item.webkitGetAsEntry?.())
          .filter((entry): entry is FileSystemEntry => entry != null);

        if (entries.length > 0) {
          const fileEntries: UploadFileEntry[] = [];
          for (const entry of entries) fileEntries.push(...(await walkEntry(entry, '')));
          if (fileEntries.length > 0) {
            await uploadEntries(fileEntries, ownerId);
            return;
          }
        }
        if (files.length > 0)
          await uploadEntries(
            files.map((file) => ({ file, path: file.name })),
            ownerId,
          );
      } catch (error) {
        await alertDialog(
          error instanceof Error ? error.message : 'Could not read the dropped files.',
          'Upload failed',
        );
      }
    },
    [cruxStore, uploadEntries],
  );

  const actionButtons = (
    <>
      {hasProjectFolder && cruxId && (
        <>
          <IconButton
            label="Reveal in Finder"
            size="sm"
            tooltip={{ label: 'Reveal in Finder' }}
            onClick={() => revealProjectFolder(cruxId)}
          >
            <RevealIcon />
          </IconButton>
          <div className="w-px h-3 bg-border mx-0.5" />
        </>
      )}
      <IconButton
        label="Collapse folders"
        size="sm"
        tooltip={{ label: 'Collapse folders' }}
        onClick={() => treeRef.current?.closeAll()}
      >
        <CollapseAllIcon />
      </IconButton>
      <div className="w-px h-3 bg-border mx-0.5" />
      <IconButton
        label="New file"
        size="sm"
        tooltip={{ label: 'New file' }}
        onClick={() => {
          startFileOperation({ type: 'create-file', parentPath: getParentPath() });
        }}
      >
        <FilePlusIcon />
      </IconButton>
      <IconButton
        label="New folder"
        size="sm"
        tooltip={{ label: 'New folder' }}
        onClick={() => {
          startFileOperation({ type: 'create-folder', parentPath: getParentPath() });
        }}
      >
        <FolderPlusIcon />
      </IconButton>
      <div className="relative" ref={uploadDropdownRef}>
        <IconButton
          label="Upload"
          size="sm"
          className={
            uploadMenuOpen ? 'bg-icon-button-hover text-icon-button-icon-hover' : undefined
          }
          aria-expanded={uploadMenuOpen}
          aria-haspopup="menu"
          onClick={() => setUploadMenuOpen((v) => !v)}
        >
          <UploadIcon />
        </IconButton>
        {uploadMenuOpen && (
          <div
            ref={uploadMenuRef}
            className="absolute top-full right-0 mt-1 z-50 min-w-32 p-1 bg-dropdown border border-dropdown-border rounded-dropdown shadow-dropdown motion-enter-dropdown"
            data-plasma-host
          >
            <PlasmaOverlay
              surfaces={[{ ref: uploadMenuRef, radius: 12, elevation: 0.6 }]}
              zIndex={-1}
              canvasStyle={{ position: 'fixed' }}
            />
            <button
              className={menuItemClass('default', 'text-xs whitespace-nowrap')}
              onClick={() => {
                setUploadMenuOpen(false);
                fileInputRef.current?.click();
              }}
            >
              Files…
            </button>
            <button
              className={menuItemClass('default', 'text-xs whitespace-nowrap')}
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
      {copySelection && (
        <CopyArtifactsDialog selection={copySelection} onClose={() => setCopySelection(null)} />
      )}
      {!isViewingSnapshot && selectedIds.length > 0 && cruxId && (
        <button
          className="text-xs text-accent text-left px-3 py-2 hover:underline"
          onClick={() => {
            const ids = new Set(expandTreeSelection(selectedIds, artifacts));
            const paths = artifacts.filter((file) => ids.has(file.id)).map(pathOf);
            if (paths.length)
              setCopySelection({ sourceId: cruxId, gardenId: captureGardenId(), paths });
          }}
        >
          Copy selected to another Crux…
        </button>
      )}
      {/* Desktop: registered Project Folder is missing on disk */}
      {folderMissing && (
        <div className="shrink-0 px-3 py-2 border-b border-border bg-error/(--tint-faint) flex items-center justify-between gap-2">
          <span className="text-xs text-text">
            Project folder is missing on disk. Your files are safe in history.
          </span>
          <button onClick={() => restoreProjectFolder()} className={buttonClass('primary', 'xs')}>
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

      <FindInFiles artifacts={artifacts} onOpen={handleOpenMatch}>
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
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent/(--tint-trace) border-2 border-dashed border-accent/(--tint-muted) rounded-[var(--radius)] pointer-events-none">
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
      </FindInFiles>

      {/* ── Selected file info ── */}
      {selectedArtifact && (
        <div className="shrink-0 border-t border-border">
          <button
            onClick={() => setFileInfoOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-2xs font-mono uppercase tracking-wider text-text-muted hover:text-text transition-colors cursor-pointer"
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
              <ConvertActions artifact={selectedArtifact} />
            </div>
          )}
        </div>
      )}

      {/* Footer: upload progress or stats */}
      {uploadProgress ? (
        <div className="shrink-0 border-t border-border">
          <div className="px-3 py-1.5 text-2xs font-mono text-accent flex justify-between">
            <span className="truncate mr-2">
              {uploadProgress.completed + 1}/{uploadProgress.total}: {uploadProgress.currentFile}
            </span>
            <span className="shrink-0">
              {Math.round((uploadProgress.completed / uploadProgress.total) * 100)}%
            </span>
          </div>
          <div className="h-0.5 bg-border">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : artifacts.length > 0 || (aiEnabled && agentFileCount > 0) ? (
        <div className="shrink-0 px-3 py-1.5 border-t border-border text-2xs font-mono text-text-muted flex items-center justify-between gap-2">
          <span>
            {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
          </span>
          {aiEnabled && agentFileCount > 0 && (
            <button
              type="button"
              aria-pressed={showAgentFiles}
              onClick={() => setShowAgentFiles((v) => !v)}
              title="AGENTS.md and CLAUDE.md: what Crux Garden tells agents working in this folder"
              className="-my-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] hover:text-text hover:bg-action-button-hover transition-colors cursor-pointer"
            >
              {showAgentFiles ? 'Hide agent files' : `Agent files (${agentFileCount})`}
            </button>
          )}
          <span className="ml-auto">{totalSize}</span>
        </div>
      ) : null}
    </div>
  );
}
