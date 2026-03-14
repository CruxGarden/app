import { useRef, useState, useEffect, Component, type ReactNode } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import EditorTabBar from './EditorTabBar';
import EditorToolbar from './EditorToolbar';
import EditorContent from './EditorContent';

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
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'crux:capture-result' || e.data?.type === 'crux:capture-error') {
        setIsCapturing(false);
      }
    }
    window.addEventListener('message', onMessage);
    const timeout = setTimeout(() => setIsCapturing(false), 10000);
    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timeout);
    };
  }, [isCapturing]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeArtifact = activeTab ? (artifacts.find((a) => a.id === activeTab.id) ?? null) : null;

  // Check if the crux has a form schema (set during template creation)
  const hasFormSchema = !!(crux?.meta as Record<string, unknown> | undefined)?.formSchema;

  if (tabs.length === 0) {
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
      <EditorTabBar tabs={tabs} activeId={activeTabId} onSelect={setActiveTab} onClose={closeTab} />
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
