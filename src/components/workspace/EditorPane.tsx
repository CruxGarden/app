import { useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import PaneHeader from './PaneHeader';
import EditorTabBar from './EditorTabBar';
import EditorToolbar from './EditorToolbar';
import EditorContent from './EditorContent';

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

export default function EditorPane() {
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const { editor, setActiveTab, closeTab, setTabViewMode } = useUIStore();
  const { tabs, activeTabId } = editor;
  const saveRef = useRef<(() => void) | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeArtifact = activeTab
    ? artifacts.find((a) => a.id === activeTab.id) ?? null
    : null;

  if (tabs.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PaneHeader paneType="editor" icon={<CodeIcon />} label="Editor" />
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
          <CodeIcon />
          <p className="text-xs mt-2 text-center px-4">
            Select a file from Artifacts to open it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="editor">
        <EditorTabBar
          tabs={tabs}
          activeId={activeTabId}
          onSelect={setActiveTab}
          onClose={closeTab}
        />
      </PaneHeader>
      {activeTab && activeArtifact && crux && (
        <>
          <EditorToolbar
            tab={activeTab}
            hasContent={true}
            onViewModeChange={(mode) => setTabViewMode(activeTab.id, mode)}
            onSave={() => saveRef.current?.()}
          />
          <EditorContent
            key={activeTab.id}
            tab={activeTab}
            artifact={activeArtifact}
            cruxId={crux.id}
            saveRef={saveRef}
          />
        </>
      )}
    </div>
  );
}
