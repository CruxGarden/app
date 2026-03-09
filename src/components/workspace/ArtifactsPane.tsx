import { useRef, useState, useCallback, useMemo } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import ArboristFileTree, {
  type ArboristFileTreeHandle,
  type UploadFileEntry,
} from '@/components/artifacts/ArboristFileTree';
import { FieldRow, formatSize, formatDate } from './MetadataContent';

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
  const createFile = useCruxStore((s) => s.createFile);
  const uploadFiles = useCruxStore((s) => s.uploadFiles);
  const uploadFile = useCruxStore((s) => s.uploadFile);
  const uploadProgress = useCruxStore((s) => s.uploadProgress);
  const moveArtifact = useCruxStore((s) => s.moveArtifact);
  const renameArtifact = useCruxStore((s) => s.renameArtifact);
  const deleteArtifacts = useCruxStore((s) => s.deleteArtifacts);
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [fileInfoOpen, setFileInfoOpen] = useState(false);

  const selectedArtifact = selectedIds.length === 1
    ? artifacts.find((a) => a.id === selectedIds[0])
    : null;

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
    const path = (artifact.meta?.path || artifact.filename || '') as string;
    const lastSlash = path.lastIndexOf('/');
    return lastSlash > 0 ? path.slice(0, lastSlash) : undefined;
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      const artifact = useCruxStore.getState().artifacts.find((a) => a.id === id);
      if (!artifact) return;
      const path = artifact.meta?.path || artifact.filename || artifact.id;
      openFile(id, path);
      if (!useUIStore.getState().paneVisibility.workshop) setPaneVisible('workshop', true);
    },
    [openFile, setPaneVisible],
  );

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, info: { id: string | null; path: string; isFolder: boolean }) => {
      e.preventDefault();
      showContextMenu({
        x: e.clientX,
        y: e.clientY,
        targetId: info.id,
        targetPath: info.path,
        isFolder: info.isFolder,
        selectedIds,
      });
    },
    [showContextMenu, selectedIds],
  );

  const handleCreateFile = useCallback(
    async (name: string) => {
      const parentPath = useUIStore.getState().activeFileOperation?.parentPath;
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      cancelFileOperation();
      const attachment = await createFile(fullPath);
      openFile(attachment.id, fullPath);
      if (!useUIStore.getState().paneVisibility.workshop) setPaneVisible('workshop', true);
    },
    [createFile, cancelFileOperation, openFile, setPaneVisible],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      const parentPath = useUIStore.getState().activeFileOperation?.parentPath;
      const fullPath = parentPath ? `${parentPath}/${name}/.keep` : `${name}/.keep`;
      cancelFileOperation();
      await createFile(fullPath, '');
    },
    [createFile, cancelFileOperation],
  );

  const handleMove = useCallback(
    async (id: string, newParentPath: string | null) => {
      // If it's a folder (id starts with "folder:"), move all children
      if (id.startsWith('folder:')) {
        const folderPath = id.replace('folder:', '');
        const children = useCruxStore.getState().artifacts.filter((a) => {
          const p = a.meta?.path || a.filename || '';
          return p.startsWith(folderPath + '/');
        });
        for (const child of children) {
          const oldPath = child.meta?.path || child.filename || '';
          const relativePath = oldPath.slice(folderPath.length); // includes leading /
          const folderName = folderPath.split('/').pop() || '';
          const newPath = newParentPath
            ? `${newParentPath}/${folderName}${relativePath}`
            : `${folderName}${relativePath}`;
          await renameArtifact(child.id, newPath);
        }
      } else {
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

        const children = useCruxStore.getState().artifacts.filter((a) => {
          const p = a.meta?.path || a.filename || '';
          return p.startsWith(oldFolderPath + '/');
        });
        for (const child of children) {
          const oldPath = child.meta?.path || child.filename || '';
          const newPath = newFolderPath + oldPath.slice(oldFolderPath.length);
          await renameArtifact(child.id, newPath);
        }
      } else {
        // File rename: swap last path segment
        const artifact = useCruxStore.getState().artifacts.find((a) => a.id === id);
        if (!artifact) return;
        const oldPath = artifact.meta?.path || artifact.filename || '';
        const pathParts = oldPath.split('/');
        pathParts[pathParts.length - 1] = newName;
        const newPath = pathParts.join('/');
        await renameArtifact(id, newPath);
      }
    },
    [renameArtifact],
  );

  const handleUploadFiles = useCallback(
    async (files: UploadFileEntry[], parentPath: string | null) => {
      const entries = files.map((f) => ({
        file: f.file,
        path: parentPath ? `${parentPath}/${f.path}` : f.path,
      }));
      await uploadFiles(entries);
    },
    [uploadFiles],
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

  const handleUploadClick = useCallback(() => {
    setImportMenuOpen((v) => !v);
  }, []);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      const parentPath = getParentPath();
      if (files.length === 1) {
        await uploadFile(files[0]!, parentPath);
      } else {
        const entries = files.map((f) => ({
          file: f,
          path: parentPath ? `${parentPath}/${f.name}` : f.name,
        }));
        await uploadFiles(entries);
      }
      e.target.value = '';
    },
    [uploadFile, uploadFiles, getParentPath],
  );

  const handleFolderInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      const parentPath = getParentPath();
      // webkitRelativePath preserves folder structure: "folderName/sub/file.txt"
      const entries = files.map((f) => ({
        file: f,
        path: parentPath ? `${parentPath}/${f.webkitRelativePath || f.name}` : (f.webkitRelativePath || f.name),
      }));
      await uploadFiles(entries);
      e.target.value = '';
    },
    [uploadFiles, getParentPath],
  );

  const actionButtons = (
    <>
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
      <div className="relative">
        <div className="relative group/btn">
          <button
            onClick={handleUploadClick}
            className="p-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <UploadIcon />
          </button>
          {!importMenuOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none hidden group-hover/btn:block">
              <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-surface-solid border border-border shadow-lg whitespace-nowrap">
                <span className="text-xs font-medium text-text">Import</span>
              </div>
            </div>
          )}
        </div>
        {importMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setImportMenuOpen(false)} />
            <div className="absolute top-full right-0 mt-1 z-50 bg-surface-solid border border-border rounded-[var(--radius-sm)] shadow-lg py-1 min-w-[100px]">
              <button
                onClick={() => {
                  setImportMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent-muted/20 transition-colors cursor-pointer"
              >
                Files
              </button>
              <button
                onClick={() => {
                  setImportMenuOpen(false);
                  folderInputRef.current?.click();
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent-muted/20 transition-colors cursor-pointer"
              >
                Folder
              </button>
            </div>
          </>
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
      {/* Action toolbar */}
      <div className="flex items-center justify-end gap-0.5 px-2 py-1 border-b border-border shrink-0 text-text-muted">
        {actionButtons}
      </div>

      {/* Hidden file inputs */}
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
        {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
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
          <div className="text-text-muted p-4">
            <p className="text-xs text-center">Create or import an artifact to get started</p>
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
            <span className="truncate">{selectedArtifact.meta?.path || selectedArtifact.filename}</span>
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
                <span>{formatSize(selectedArtifact.size)}</span>
              </FieldRow>
              <FieldRow label="Type">
                <span>{selectedArtifact.mimeType}</span>
              </FieldRow>
              <FieldRow label="Created">
                <span>{formatDate(selectedArtifact.created)}</span>
              </FieldRow>
              <FieldRow label="Updated">
                <span>{formatDate(selectedArtifact.updated)}</span>
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
            <span className="shrink-0">{Math.round(((uploadProgress.completed) / uploadProgress.total) * 100)}%</span>
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
