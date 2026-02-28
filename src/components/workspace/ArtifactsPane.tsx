import { useRef, useCallback, useMemo } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import ArboristFileTree, { type ArboristFileTreeHandle } from '@/components/artifacts/ArboristFileTree';
import PaneHeader from './PaneHeader';

function FolderPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function FilePlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function ArtifactsPane() {
  const artifacts = useCruxStore((s) => s.artifacts);
  const createFile = useCruxStore((s) => s.createFile);
  const uploadFile = useCruxStore((s) => s.uploadFile);
  const moveArtifact = useCruxStore((s) => s.moveArtifact);
  const renameArtifact = useCruxStore((s) => s.renameArtifact);
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

  const handleSelect = useCallback((id: string) => {
    const artifact = useCruxStore.getState().artifacts.find((a) => a.id === id);
    if (!artifact) return;
    const path = artifact.meta?.path || artifact.filename || artifact.id;
    openFile(id, path);
    if (!useUIStore.getState().paneVisibility.workshop) setPaneVisible('workshop', true);
  }, [openFile, setPaneVisible]);

  const handleContextMenu = useCallback((
    e: React.MouseEvent,
    info: { id: string | null; path: string; isFolder: boolean },
  ) => {
    e.preventDefault();
    showContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetId: info.id,
      targetPath: info.path,
      isFolder: info.isFolder,
    });
  }, [showContextMenu]);

  const handleCreateFile = useCallback(async (name: string) => {
    const parentPath = useUIStore.getState().activeFileOperation?.parentPath;
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    cancelFileOperation();
    const attachment = await createFile(fullPath);
    openFile(attachment.id, fullPath);
    if (!useUIStore.getState().paneVisibility.workshop) setPaneVisible('workshop', true);
  }, [createFile, cancelFileOperation, openFile, setPaneVisible]);

  const handleCreateFolder = useCallback(async (name: string) => {
    const parentPath = useUIStore.getState().activeFileOperation?.parentPath;
    const fullPath = parentPath ? `${parentPath}/${name}/.keep` : `${name}/.keep`;
    cancelFileOperation();
    await createFile(fullPath, '');
  }, [createFile, cancelFileOperation]);

  const handleMove = useCallback(async (id: string, newParentPath: string | null) => {
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
  }, [moveArtifact, renameArtifact]);

  const handleRename = useCallback(async (id: string, newName: string) => {
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
  }, [renameArtifact]);

  const handleUploadFiles = useCallback(async (files: File[], parentPath: string | null) => {
    for (const file of files) {
      await uploadFile(file, parentPath ?? undefined);
    }
  }, [uploadFile]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const parentPath = getParentPath();
    for (const file of files) {
      await uploadFile(file, parentPath);
    }
    // Reset input so the same file can be re-uploaded
    e.target.value = '';
  }, [uploadFile, getParentPath]);

  const actionButtons = (
    <>
      <button
        onClick={() => {
          startFileOperation({ type: 'create-file', parentPath: getParentPath() });
        }}
        className="p-1 text-text-muted hover:text-text transition-colors cursor-pointer"
        title="New file"
      >
        <FilePlusIcon />
      </button>
      <button
        onClick={() => {
          startFileOperation({ type: 'create-folder', parentPath: getParentPath() });
        }}
        className="p-1 text-text-muted hover:text-text transition-colors cursor-pointer"
        title="New folder"
      >
        <FolderPlusIcon />
      </button>
      <button
        onClick={handleUploadClick}
        className="p-1 text-text-muted hover:text-text transition-colors cursor-pointer"
        title="Upload files"
      >
        <UploadIcon />
      </button>
    </>
  );

  const showTree = artifacts.length > 0 || (
    activeFileOperation &&
    (activeFileOperation.type === 'create-file' || activeFileOperation.type === 'create-folder')
  );

  const totalSize = useMemo(() => {
    const bytes = artifacts.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [artifacts]);

  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="artifacts" icon={<TreeIcon />} label="Artifacts" actions={actionButtons} />

      {/* Hidden file input for upload button */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      <div
        className="flex-1 overflow-hidden min-h-0"
        onContextMenu={(e) => {
          e.preventDefault();
          showContextMenu({
            x: e.clientX,
            y: e.clientY,
            targetId: null,
            targetPath: '',
            isFolder: true,
          });
        }}
      >
        {showTree ? (
          <ArboristFileTree
            ref={treeRef}
            artifacts={artifacts}
            selectedId={activeTabId}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
            onMove={handleMove}
            onRename={handleRename}
            onUploadFiles={handleUploadFiles}
            activeFileOperation={activeFileOperation}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onCancelOperation={cancelFileOperation}
            initialOpenState={folderOpenState}
            onFolderToggle={setFolderOpen}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <TreeIcon />
            <p className="text-xs mt-2 text-center px-4">
              Artifacts will appear here as you create with the AI.
            </p>
          </div>
        )}
      </div>

      {artifacts.length > 0 && (
        <div className="shrink-0 px-3 py-1.5 border-t border-border text-[10px] font-mono text-text-muted flex justify-between">
          <span>{artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}</span>
          <span>{totalSize}</span>
        </div>
      )}
    </div>
  );
}
