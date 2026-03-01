import { useState, useCallback } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import FileTree from './FileTree';
import FileContent from './FileContent';
import FileTabs from './FileTabs';

function TreeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function FileViewer() {
  const { crux, artifacts, artifactsVersion } = useCruxStore();
  const author = useAuthStore((s) => s.author);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [treeVisible, setTreeVisible] = useState(true);

  const activeArtifact = artifacts.find((a) => a.id === activeTab) || null;

  const tabs = openTabs
    .map((id) => {
      const a = artifacts.find((art) => art.id === id);
      if (!a) return null;
      const path = a.meta?.path || a.filename || a.id;
      const name = path.split('/').pop() || path;
      return { id, name, path };
    })
    .filter(Boolean) as { id: string; name: string; path: string }[];

  const handleSelect = useCallback((id: string) => {
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveTab(id);
  }, []);

  const handleCloseTab = useCallback(
    (id: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t !== id);
        if (id === activeTab) {
          const idx = prev.indexOf(id);
          const newActive = next[Math.min(idx, next.length - 1)] || null;
          setActiveTab(newActive);
        }
        if (next.length === 0) {
          setTreeVisible(true);
        }
        return next;
      });
    },
    [activeTab],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-display font-medium text-text-muted uppercase tracking-wider">
          Artifacts
        </h3>
        {openTabs.length > 0 && (
          <button
            onClick={() => setTreeVisible((v) => !v)}
            className="text-text-muted hover:text-text transition-colors cursor-pointer"
            title={treeVisible ? 'Hide artifact tree' : 'Show artifact tree'}
          >
            <TreeIcon />
          </button>
        )}
      </div>

      {/* Tabs */}
      <FileTabs
        tabs={tabs}
        activeId={activeTab}
        onSelect={setActiveTab}
        onClose={handleCloseTab}
      />

      {/* Tree + Content split */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Tree (collapsible) */}
        {treeVisible && (
          <div
            className={
              openTabs.length > 0
                ? 'max-h-48 overflow-y-auto border-b border-border shrink-0'
                : 'flex-1 overflow-y-auto'
            }
          >
            <FileTree
              artifacts={artifacts}
              selectedId={activeTab}
              onSelect={handleSelect}
            />
          </div>
        )}

        {/* File content */}
        {activeArtifact && crux && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <FileContent
              key={`${activeArtifact.id}-${artifactsVersion}`}
              artifact={activeArtifact}
              cruxId={crux.id}
              artifacts={artifacts}
              username={author?.username}
              slug={crux.slug}
            />
          </div>
        )}
      </div>
    </div>
  );
}
