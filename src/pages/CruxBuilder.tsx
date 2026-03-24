import { useEffect, useCallback, useRef } from 'react';
import { useParams, useBlocker } from 'react-router-dom';
import { useCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { WorkspaceLayout } from '@/components/workspace';
import { saveAllDirtyEditors } from '@/components/workspace/EditorContent';
import { Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/constants';

export default function CruxBuilder() {
  const { id } = useParams<{ id: string }>();
  const { crux, loadCrux, reset, artifacts } = useCruxStore();
  const { setPaneVisible, setActiveCrux } = useUIStore();
  const hasDirtyTabs = useUIStore((s) => s.editor.tabs.some((t) => t.dirty));

  useEffect(() => {
    if (id) {
      loadCrux(id);
      setActiveCrux(id);
    }
    return () => {
      reset();
      setActiveCrux(null);
    };
  }, [id, loadCrux, reset, setActiveCrux]);

  // Auto-open index.html in preview mode on first load (no saved tabs)
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!crux || autoOpenedRef.current) return;
    autoOpenedRef.current = true;

    const { editor, openFile, setTabViewMode, setPaneVisible } = useUIStore.getState();
    // Only auto-open if there are no restored tabs
    if (editor.tabs.length > 0) return;

    const index = artifacts.find((a) => {
      const p = (a.meta?.path || a.filename || '').toLowerCase().replace(/^\//, '');
      return p === 'index.html';
    });
    if (index) {
      const path = (index.meta?.path || index.filename || 'index.html') as string;
      openFile(index.id, path);
      // Defer viewMode set so the tab exists first
      requestAnimationFrame(() => {
        setTabViewMode(index.id, 'preview');
      });
      // Ensure workshop pane is visible
      const vis = useUIStore.getState().paneVisibility;
      if (!vis.workshop) setPaneVisible('workshop', true);
    }
  }, [crux, artifacts]);

  // Auto-show artifact + workshop panes ONLY when the first artifact is
  // created during a live session (not on page load with existing artifacts).
  // We gate on `crux` so the ref isn't set until loadCrux resolves (which
  // sets crux + artifacts in the same Zustand set() call, same render).
  const prevArtifactCount = useRef<number | null>(null);
  useEffect(() => {
    prevArtifactCount.current = null;
    autoOpenedRef.current = false;
  }, [id]);
  useEffect(() => {
    if (!crux) return; // Don't track until the crux is loaded
    const prev = prevArtifactCount.current;
    prevArtifactCount.current = artifacts.length;
    if (prev === 0 && artifacts.length > 0) {
      const vis = useUIStore.getState().paneVisibility;
      if (!vis.artifacts && !vis.workshop) {
        setPaneVisible('artifacts', true);
        setPaneVisible('workshop', true);
      }
    }
  }, [crux, artifacts.length, setPaneVisible, id]);

  // Page title
  useEffect(() => {
    if (crux?.title) {
      document.title = crux.title;
    }
    return () => {
      document.title = APP_NAME;
    };
  }, [crux?.title]);

  // Warn before closing browser tab with unsaved files
  useEffect(() => {
    if (!hasDirtyTabs) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasDirtyTabs]);

  // Block in-app navigation with unsaved files
  const blocker = useBlocker(hasDirtyTabs);

  // Discard: clear dirty flags so auto-save on unmount is skipped
  const handleDiscard = useCallback(() => {
    const { editor, setTabDirty } = useUIStore.getState();
    editor.tabs.forEach((t) => {
      if (t.dirty) setTabDirty(t.id, false);
    });
    blocker.proceed?.();
  }, [blocker]);

  if (!crux) return null;

  return (
    <>
      <WorkspaceLayout />

      {/* Unsaved changes — navigation blocked */}
      <Modal open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()}>
        <h2 className="font-display text-sm font-medium text-text mb-2">Unsaved changes</h2>
        <p className="text-xs text-text-muted mb-4">
          You have unsaved file edits. What would you like to do?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => blocker.reset?.()}
            className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            Stay
          </button>
          <button
            onClick={handleDiscard}
            className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            Discard & leave
          </button>
          <button
            onClick={async () => {
              await saveAllDirtyEditors();
              blocker.proceed?.();
            }}
            className={cn(
              'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
              'bg-accent-muted text-accent border border-accent/20 hover:border-accent transition-all cursor-pointer',
            )}
          >
            Save & leave
          </button>
        </div>
      </Modal>
    </>
  );
}
