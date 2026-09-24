import { useGardenContext } from '@/stores/gardenContext';
import { getServices } from '@/services';
import GardenNavigator from './GardenNavigator';
import TendingNotifications from '@/components/tending/TendingNotifications';
import { startTendingCatalog } from '@/stores/tendingStore';
import WorkspaceLifecycle from './WorkspaceLifecycle';
import { restoreWorkspaceList } from '@/stores/workspaceRegistry';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import TopBar from './TopBar';
import { DialogHost } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { useAppStore } from '@/stores/appStore';
import { dismissSplash } from '@/lib/splash';
import { startSignals } from '@/lib/moods/signals';
import { Capability, can } from '@/lib/platform';

const Console = lazy(() => import('@/components/keeper/Console'));
const Settings = lazy(() => import('@/pages/Settings'));
const Explore = lazy(() => import('@/pages/Explore'));
const Mood = lazy(() => import('@/components/mood/Mood'));
import MoodTextureLayers from './MoodTextureLayers';
import { MotionConfig } from 'motion/react';

export default function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [servicesReady, setServicesReady] = useState(useAppStore.getState().ready);
  const [initError, setInitError] = useState<string | null>(null);
  const aiEnabled = useUIStore((s) => s.aiEnabled);
  const consoleOpen = useUIStore((s) => s.consoleOpen);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const exploreOpen = useUIStore((s) => s.exploreOpen);
  const rootGarden = useGardenContext((s) => s.root);
  const activeGarden = useGardenContext((s) => s.garden);
  const gardenId = new URLSearchParams(location.search).get('garden') ?? rootGarden?.id;
  const [gardenError, setGardenError] = useState<string | null>(null);
  useEffect(() => {
    if (!servicesReady || !gardenId) return;
    let cancelled = false;
    setGardenError(null);
    void getServices()
      .crux.findById(gardenId)
      .then((garden) => {
        if (garden.kind !== 'garden' || garden.deleted)
          throw new Error('This Garden is unavailable.');
        if (cancelled) return;
        useGardenContext.getState().select(garden);
        if (!new URLSearchParams(location.search).has('garden')) {
          const query = new URLSearchParams(location.search);
          query.set('garden', garden.id);
          navigate(`${location.pathname}?${query}`, { replace: true });
        }
      })
      .catch((error) => {
        if (!cancelled) setGardenError((error as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [servicesReady, gardenId, location.pathname, location.search, navigate]);
  const moodPanelOpen = useUIStore((s) => s.moodPanelOpen);

  useEffect(() => {
    if (!servicesReady) return;
    void restoreWorkspaceList().catch(console.error);
  }, [servicesReady, navigate]);

  useEffect(() => {
    if (servicesReady) return startTendingCatalog();
  }, [servicesReady]);

  // Reactive theme signals (--signal-audio/typing/agent) live for the app's lifetime
  useEffect(() => startSignals(), []);

  // Frameless-window chrome, as an attribute the stylesheets can read. Only
  // there do the traffic lights exist, and only there does anything need to
  // leave room for them — the Plasma dock does.
  useEffect(() => {
    document.documentElement.dataset.desktopChrome = can(Capability.DesktopChrome)
      ? 'true'
      : 'false';
  }, []);

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
    // Motion never applies its own reduced-motion rule: the person's motion intensity (ADR 0041)
    // already maps prefers-reduced-motion to instant through the tokens every role reads.
    <MotionConfig reducedMotion="never">
      <div className="flex flex-col h-screen overflow-hidden">
        <WorkspaceLifecycle />
        {servicesReady && <TendingNotifications />}
        <MoodTextureLayers />
        {/* Top bar */}
        <div className="plasma-drag-strip relative z-20 shrink-0">
          <TopBar />
        </div>

        {/* Main */}
        <div className="flex flex-1 min-h-0 overflow-x-auto">
          {servicesReady && <GardenNavigator />}
          <main className="relative flex-1 min-w-0 min-h-0 overflow-y-auto">
            {initError || gardenError ? (
              <div role="alert" className="flex h-full items-center justify-center p-8 text-center">
                <div className="max-w-sm flex flex-col gap-2">
                  <h2 className="font-display text-base text-text">Crux Garden couldn't start</h2>
                  <p className="text-xs text-text-muted">{initError || gardenError}</p>
                </div>
              </div>
            ) : servicesReady && (!gardenId || activeGarden?.id === gardenId) ? (
              <Outlet />
            ) : null}
          </main>
          {aiEnabled && consoleOpen && (
            <GardenPanel title="Console" onClose={() => setConsoleOpen(false)}>
              <Console />
            </GardenPanel>
          )}
          {moodPanelOpen && (
            <GardenPanel title="Mood" onClose={() => useUIStore.getState().setMoodPanelOpen(false)}>
              <Mood compact />
            </GardenPanel>
          )}
          {settingsOpen && (
            <GardenPanel
              title="Settings"
              onClose={() => useUIStore.getState().setSettingsOpen(false)}
            >
              <Settings />
            </GardenPanel>
          )}
          {exploreOpen && (
            <GardenPanel
              title="Explore"
              onClose={() => useUIStore.getState().setExploreOpen(false)}
            >
              <Explore onNavigate={() => useUIStore.getState().setExploreOpen(false)} />
            </GardenPanel>
          )}
        </div>

        {/* App confirm/alert dialogs (replaces window.confirm/alert) */}
        <DialogHost />
      </div>
    </MotionConfig>
  );
}

function GardenPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="w-[min(32rem,45vw)] min-w-64 shrink-0 border-l border-border bg-panel flex flex-col min-h-0 text-text"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-display font-medium">{title}</h2>
        <button
          aria-label={`Close ${title}`}
          onClick={onClose}
          className="px-2 text-text-muted hover:text-text cursor-pointer"
        >
          ×
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-auto">
        <Suspense fallback={<p className="p-4 text-sm text-text-muted">Opening {title}…</p>}>
          {children}
        </Suspense>
      </div>
    </section>
  );
}
