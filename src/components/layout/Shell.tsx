import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import { Modal, DialogHost } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { useAppStore } from '@/stores/appStore';
import { dismissSplash } from '@/lib/splash';

const Console = lazy(() => import('@/components/keeper/Console'));
const Settings = lazy(() => import('@/pages/Settings'));
const Explore = lazy(() => import('@/pages/Explore'));
const Mood = lazy(() => import('@/components/mood/Mood'));

export default function Shell() {
  const [servicesReady, setServicesReady] = useState(useAppStore.getState().ready);
  const [initError, setInitError] = useState<string | null>(null);
  const aiEnabled = useUIStore((s) => s.aiEnabled);
  const consoleOpen = useUIStore((s) => s.consoleOpen);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const exploreOpen = useUIStore((s) => s.exploreOpen);
  const moodPanelOpen = useUIStore((s) => s.moodPanelOpen);

  useEffect(() => {
    if (servicesReady) return;
    useAppStore
      .getState()
      .bootstrap()
      .then(() => {
        dismissSplash();
        setServicesReady(true);
      })
      .catch((err: unknown) => {
        // The old fallback had no catch: a failed init left the TopBar over an
        // empty <main> with no message, forever.
        console.error('[shell] bootstrap failed:', err);
        dismissSplash();
        setInitError(err instanceof Error ? err.message : 'Could not start Crux Garden.');
      });
  }, [servicesReady]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      // A modal or an editable control that already handled this key owns it.
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const editing =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

      // Escape → open console (when AI enabled, console not open, not typing)
      if (e.key === 'Escape' && !consoleOpen && aiEnabled && !editing) {
        setConsoleOpen(true);
        return;
      }

      // Cmd+K → toggle explore
      if (meta && e.key === 'k') {
        e.preventDefault();
        useUIStore.getState().setExploreOpen(!useUIStore.getState().exploreOpen);
        return;
      }

      // Cmd+M → toggle the Mood modal
      if (meta && e.key === 'm') {
        e.preventDefault();
        useUIStore.getState().toggleMoodPanel();
        return;
      }

      // Cmd+, → toggle settings
      if (meta && e.key === ',') {
        e.preventDefault();
        useUIStore.getState().setSettingsOpen(!useUIStore.getState().settingsOpen);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [consoleOpen, setConsoleOpen, aiEnabled]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="relative z-20 shrink-0">
        <TopBar />
      </div>

      {/* Main */}
      <main className="relative flex-1 min-h-0 overflow-y-auto">
        {initError ? (
          <div role="alert" className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-sm flex flex-col gap-2">
              <h2 className="font-display text-base text-text">Crux Garden couldn't start</h2>
              <p className="text-xs text-text-muted">{initError}</p>
            </div>
          </div>
        ) : servicesReady ? (
          <Outlet />
        ) : null}
      </main>

      {/* App confirm/alert dialogs (replaces window.confirm/alert) */}
      <DialogHost />

      {/* Console Modal */}
      {aiEnabled && (
        <Modal
          open={consoleOpen}
          onClose={() => setConsoleOpen(false)}
          size="lg"
          title="Console — The Keeper"
          className="h-[min(520px,70vh)]"
          flush
        >
          <Suspense fallback={null}>
            <Console />
          </Suspense>
        </Modal>
      )}

      {/* Mood Modal — quick picks; the Mood Builder page has the full editor */}
      <Modal
        open={moodPanelOpen}
        onClose={() => useUIStore.getState().setMoodPanelOpen(false)}
        size="screen"
        title="Mood"
      >
        <Suspense fallback={null}>
          <Mood compact />
        </Suspense>
      </Modal>

      {/* Settings Modal */}
      <Modal
        open={settingsOpen}
        onClose={() => useUIStore.getState().setSettingsOpen(false)}
        size="screen"
        title="Settings"
      >
        <Suspense fallback={null}>
          <Settings />
        </Suspense>
      </Modal>

      {/* Explore Modal */}
      <Modal
        open={exploreOpen}
        onClose={() => useUIStore.getState().setExploreOpen(false)}
        size="screen"
        title="Explore"
      >
        <Suspense fallback={null}>
          <Explore onNavigate={() => useUIStore.getState().setExploreOpen(false)} />
        </Suspense>
      </Modal>
    </div>
  );
}
