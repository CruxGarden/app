import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import FileTree from '@/components/artifacts/FileTree';
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

function TreeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function ArtifactsPane() {
  const artifacts = useCruxStore((s) => s.artifacts);
  const { openFile, setPaneVisible, paneVisibility, editor, startFileOperation, showContextMenu } = useUIStore();

  const handleSelect = (id: string) => {
    const artifact = artifacts.find((a) => a.id === id);
    if (!artifact) return;
    const path = artifact.meta?.path || artifact.filename || artifact.id;
    openFile(id, path);
    if (!paneVisibility.editor) setPaneVisible('editor', true);
  };

  const handleContextMenu = (
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
  };

  const actionButtons = (
    <>
      <button
        onClick={() => startFileOperation({ type: 'create-file' })}
        className="p-1 text-text-muted hover:text-text transition-colors cursor-pointer"
        title="New file"
      >
        <FilePlusIcon />
      </button>
      <button
        onClick={() => startFileOperation({ type: 'create-folder' })}
        className="p-1 text-text-muted hover:text-text transition-colors cursor-pointer"
        title="New folder"
      >
        <FolderPlusIcon />
      </button>
    </>
  );

  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="artifacts" icon={<TreeIcon />} label="Artifacts" actions={actionButtons} />

      <div className="flex-1 overflow-y-auto min-h-0">
        {artifacts.length > 0 ? (
          <FileTree
            artifacts={artifacts}
            selectedId={editor.activeTabId}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
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
    </div>
  );
}
