import { useRef, useState, useEffect, Component, type ReactNode } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import EditorTabBar from './EditorTabBar';
import EditorToolbar from './EditorToolbar';
import EditorContent from './EditorContent';
import BuilderView from './BuilderView';
import { onCaptureSettled } from '@/lib/thumbnail-capture';
import { cn } from '@/lib/cn';

/** Auto-recovery boundary for Monaco disposal errors during pane reorder */
class EditorErrorBoundary extends Component<{ children: ReactNode }, { retryKey: number }> {
  state = { retryKey: 0 };
  static getDerivedStateFromError() {
    return {};
  }
  componentDidCatch() {
    this.setState((prev) => ({ retryKey: prev.retryKey + 1 }));
  }
  render() {
    return (
      <div key={this.state.retryKey} className="contents">
        {this.props.children}
      </div>
    );
  }
}

export default function EditorPane() {
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const { editor, setActiveTab, closeTab, setTabViewMode } = useUIStore();
  const { tabs, activeTabId } = editor;
  const saveRef = useRef<(() => void) | null>(null);
  const captureRef = useRef<(() => void) | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Listen for capture completion to reset the capturing state
  useEffect(() => {
    if (!isCapturing) return;
    const unsubscribe = onCaptureSettled(() => setIsCapturing(false));
    const timeout = setTimeout(() => setIsCapturing(false), 10000);
    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [isCapturing]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeArtifact = activeTab ? (artifacts.find((a) => a.id === activeTab.id) ?? null) : null;

  // Check if the crux has a form schema (set during template creation)
  const hasFormSchema = !!(crux?.meta as Record<string, unknown> | undefined)?.formSchema;
  // Content-model cruxes get the Builder as the Workshop's home view
  const hasBuilder = !!(crux?.meta as Record<string, unknown> | undefined)?.contentModel;
  const showBuilder = hasBuilder && !activeTab;

  if (tabs.length === 0) {
    if (hasBuilder) {
      return (
        <div className="flex flex-col h-full">
          <BuilderView />
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full">
        <div className="text-text-muted p-4">
          <p className="text-xs text-center">Select a file from Artifacts to work on it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-stretch shrink-0">
        {hasBuilder && (
          <button
            onClick={() => setActiveTab(null)}
            title="Builder"
            className={cn(
              'shrink-0 px-3 text-xs border-b border-r border-border transition-colors cursor-pointer',
              showBuilder
                ? 'text-accent bg-surface'
                : 'text-text-muted hover:text-text',
            )}
          >
            ⌂
          </button>
        )}
        <div className="flex-1 min-w-0">
          <EditorTabBar tabs={tabs} activeId={activeTabId} onSelect={setActiveTab} onClose={closeTab} />
        </div>
      </div>
      {showBuilder && <BuilderView />}
      {activeTab && activeArtifact && crux && (
        <>
          <EditorToolbar
            tab={activeTab}
            hasContent={true}
            hasFormSchema={hasFormSchema}
            onViewModeChange={(mode) => setTabViewMode(activeTab.id, mode)}
            onSave={() => saveRef.current?.()}
            onCapture={() => {
              setIsCapturing(true);
              captureRef.current?.();
            }}
            isCapturing={isCapturing}
          />
          <EditorErrorBoundary>
            <EditorContent
              key={activeTab.id}
              tab={activeTab}
              artifact={activeArtifact}
              cruxId={crux.id}
              saveRef={saveRef}
              captureRef={captureRef}
            />
          </EditorErrorBoundary>
        </>
      )}
    </div>
  );
}
