import { requiresLivePreview, settingsPathOf } from '@/lib/preview-decision';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { isSiteCrux } from '@/services/site';
import { documentIdentity } from '@/services/workspace-documents';
import FigmaPane from './FigmaPane';
import BlenderPane from './BlenderPane';
import { isEmbeddedApp } from '@/services/embedded-app';
import { useRef, useState, useEffect, Component, type ReactNode } from 'react';
import { useWorkspaceUIStore as useUIStore } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import EditorTabBar from './EditorTabBar';
import EditorToolbar from './EditorToolbar';
import EditorContent from './EditorContent';
import BuilderView from './BuilderView';
import { onCaptureSettled } from '@/lib/thumbnail-capture';
import { cn } from '@/lib/cn';
import { buttonClass, segmentClass, segmentGroupClass } from '@/components/ui/button-class';
import { useShallow } from 'zustand/react/shallow';
import { workshopEntry } from '@/lib/workshop-entry';
import { pathOf } from '@/lib/artifact-path';
import EmbeddedAppActions from './EmbeddedAppActions';
import CruxspaceAssetsButton from './CruxspaceAssetsButton';
import { useBlobUrl } from '@/hooks/useBlobUrl';

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

function AdvancedEditor() {
  const historical = useCruxStore((s) => s.viewingSnapshotId !== null);
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const { editor, setActiveTab, closeTab, setTabViewMode } = useUIStore(
    useShallow((s) => ({
      editor: s.editor,
      setActiveTab: s.setActiveTab,
      closeTab: s.closeTab,
      setTabViewMode: s.setTabViewMode,
    })),
  );
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
  const sourceOnly =
    !!activeTab && historical && requiresLivePreview(activeTab.path, isSiteCrux(artifacts));

  // Check if the crux has a form schema (set during template creation)
  const hasFormSchema = !!(crux?.meta as Record<string, unknown> | undefined)?.formSchema;
  const settingsPath = settingsPathOf(crux?.meta as Record<string, unknown> | undefined);
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
              showBuilder ? 'text-accent bg-surface' : 'text-text-muted hover:text-text',
            )}
          >
            ⌂
          </button>
        )}
        <div className="flex-1 min-w-0">
          <EditorTabBar
            tabs={tabs}
            activeId={activeTabId}
            onSelect={setActiveTab}
            onClose={closeTab}
          />
        </div>
      </div>
      {showBuilder && <BuilderView />}
      {activeTab && activeArtifact && crux && (
        <>
          <EditorToolbar
            tab={sourceOnly ? { ...activeTab, viewMode: 'source' } : activeTab}
            previewAvailable={!sourceOnly}
            hasContent={true}
            hasFormSchema={hasFormSchema && !sourceOnly}
            settingsPath={settingsPath}
            onViewModeChange={(mode) => setTabViewMode(activeTab.id, mode)}
            onSave={() => saveRef.current?.()}
            onCapture={
              historical
                ? undefined
                : () => {
                    setIsCapturing(true);
                    captureRef.current?.();
                  }
            }
            isCapturing={isCapturing}
          />
          <EditorErrorBoundary>
            <EditorContent
              key={documentIdentity(activeArtifact)}
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

/** Clean preview owns no editor tabs: changing views preserves their buffers and selection. */
export default function EditorPane() {
  const crux = useCruxStore((s) => s.crux);
  const historicalNotebook = useCruxStore((s) => isEmbeddedApp(s.crux) && !!s.viewingSnapshotId);
  const exitSnapshot = useCruxStore((s) => s.exitSnapshotView);
  const artifacts = useCruxStore((s) => s.artifacts);
  const view = useUIStore((s) => s.workshopView);
  const setView = useUIStore((s) => s.setWorkshopView);
  const openFile = useUIStore((s) => s.openFile);
  const hasTabs = useUIStore((s) => s.editor.tabs.length > 0);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const setPane = useUIStore((s) => s.setPaneVisible);
  // Offered only while it is not already beside the Workshop.
  const collaborationOpen = useUIStore((s) => !!s.paneVisibility.collaboration);
  const setMobilePane = useUIStore((s) => s.setMobileActivePane);
  const entryFile = useCruxStore((s) =>
    s.viewingSnapshotId ? s.snapshotEntryFile : s.crux?.meta?.settings?.entryFile,
  );
  const entry = workshopEntry(crux, artifacts, entryFile);
  const hasBuilder = !!crux?.meta?.contentModel;
  const aiEnabled = useAiEnabled();
  const button = buttonClass('ghost', 'xs', 'text-text-muted hover:text-text');
  const settings = () => {
    setPane('details', true);
    setMobilePane('details');
  };
  return (
    <div className="flex flex-col h-full min-h-0" data-testid="workshop-view" data-view={view}>
      <div className="flex items-center gap-1 px-1.5 py-1.5 border-b border-border shrink-0 flex-wrap">
        <div role="group" aria-label="Workshop view" className={segmentGroupClass()}>
          {(['clean', 'advanced'] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={view === mode}
              className={segmentClass(view === mode)}
              onClick={() => {
                if (mode === 'advanced' && !hasTabs && entry.artifact && !hasBuilder) {
                  openFile(entry.artifact.id, pathOf(entry.artifact));
                } else setView(mode);
              }}
            >
              {mode === 'clean' ? (isEmbeddedApp(crux) ? 'Use app' : 'Clean') : 'Advanced'}
            </button>
          ))}
        </div>
        <EmbeddedAppActions />
        <div className="flex-1" />
        {view === 'advanced' && (
          <button
            className={button}
            onClick={() => {
              setPane('artifacts', true);
              setMobilePane('artifacts');
            }}
          >
            Browse Artifacts
          </button>
        )}
        {hasBuilder && (
          <button
            className={button}
            onClick={() => {
              setActiveTab(null);
              setView('advanced');
            }}
          >
            Edit content
          </button>
        )}
        <button className={button} onClick={settings}>
          Details
        </button>
        <CruxspaceAssetsButton />
      </div>
      {view === 'clean' && crux?.meta?.template === 'figma' ? (
        <FigmaPane key={crux.id} />
      ) : view === 'clean' && crux?.meta?.template === 'blender' ? (
        <BlenderPane key={crux.id} />
      ) : view === 'clean' && historicalNotebook ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center min-h-0">
          <h2 className="text-lg">Saved app checkpoint</h2>
          <CheckpointPicture
            fingerprint={artifacts.find((a) => pathOf(a) === 'preview.jpg')?.fingerprint ?? null}
          />
          <p className="text-sm text-text-muted">
            Read the saved Artifacts in Advanced view. Return to the current app to write.
          </p>
          <button
            className={buttonClass('primary', 'sm')}
            onClick={() => {
              const note = artifacts.find(
                (a) =>
                  (pathOf(a).startsWith('notebook/') && /\.md$/i.test(pathOf(a))) ||
                  pathOf(a) === 'mockups/project.json',
              );
              setPane('artifacts', true);
              if (note) openFile(note.id, pathOf(note));
              else setView('advanced');
            }}
          >
            Read saved Artifacts
          </button>
          <button className={buttonClass('secondary', 'sm')} onClick={() => void exitSnapshot()}>
            Return to current app
          </button>
        </div>
      ) : view === 'advanced' ? (
        <div className="flex-1 min-h-0">
          <AdvancedEditor />
        </div>
      ) : entry.artifact && crux ? (
        <EditorErrorBoundary>
          <EditorContent
            key={documentIdentity(entry.artifact)}
            cruxId={crux.id}
            artifact={entry.artifact}
            clean
            tab={{
              id: entry.artifact.id,
              path: pathOf(entry.artifact),
              name: pathOf(entry.artifact),
              viewMode: 'preview',
              dirty: false,
              scrollTop: 0,
            }}
          />{' '}
        </EditorErrorBoundary>
      ) : (
        <div className="flex-1 flex flex-col justify-center items-center p-6 text-center gap-4">
          <h2 className="text-lg font-medium">
            {entry.missing ? 'Choose an available entry file' : 'Your creation will appear here'}
          </h2>
          <p className="text-sm text-text-muted max-w-sm">
            {entry.missing
              ? `${entry.missing} is missing or cannot be previewed. Select another Artifact in Details, or restore it from Growth.`
              : aiEnabled
                ? 'Describe what you want to make in Collaboration. As your files arrive, the preview opens here.'
                : 'Add files or make one in Advanced. As your files arrive, the preview opens here.'}
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
            {aiEnabled && !collaborationOpen && (
              <button
                className={buttonClass('primary', 'sm')}
                onClick={() => {
                  setPane('collaboration', true);
                  setMobilePane('collaboration');
                }}
              >
                Open Collaboration
              </button>
            )}
            <button
              className={buttonClass(
                aiEnabled && !collaborationOpen ? 'secondary' : 'primary',
                'sm',
              )}
              onClick={() => {
                setPane('artifacts', true);
                setMobilePane('artifacts');
                setView('advanced');
              }}
            >
              Add files
            </button>
            {!entry.missing && artifacts.length > 0 && (
              <button className={buttonClass('secondary', 'sm')} onClick={settings}>
                Choose entry file
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** How the app looked when the checkpoint was taken: the thumbnail saved with it. */
function CheckpointPicture({ fingerprint }: { fingerprint: string | null }) {
  const url = useBlobUrl(fingerprint, 'image/jpeg');
  if (!url) return null;
  return (
    <img
      src={url}
      alt="The app as it was at this checkpoint"
      className="max-h-[60%] max-w-full rounded-[var(--radius-sm)] border border-border object-contain"
    />
  );
}
