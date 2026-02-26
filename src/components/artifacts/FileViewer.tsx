import { useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import FileTree from './FileTree';
import FileContent from './FileContent';

export default function FileViewer() {
  const { crux, artifacts } = useCruxStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = artifacts.find((a) => a.id === selectedId) || null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-xs font-display font-medium text-text-muted uppercase tracking-wider">
          Files
        </h3>
      </div>

      {selected && crux ? (
        <div className="flex-1 flex flex-col min-h-0">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FileContent artifact={selected} cruxId={crux.id} />
          </div>
        </div>
      ) : (
        <FileTree
          artifacts={artifacts}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
    </div>
  );
}
