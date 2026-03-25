import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import { applySavedMoodSettings } from '@/components/mood/mood-helpers';
import { Modal } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { isServicesReady, initServices } from '@/services';
import { getSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { seedTutorialCrux } from '@/services/seedTutorial';
import { useMoodStore } from '@/stores/moodStore';

const Console = lazy(() => import('@/components/keeper/Console'));
const Settings = lazy(() => import('@/pages/Settings'));
const Explore = lazy(() => import('@/pages/Explore'));
const Mood = lazy(() => import('@/components/mood/Mood'));

const hideSplashScreen = () => {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 300);
  }
};

export default function Shell() {
  const [servicesReady, setServicesReady] = useState(isServicesReady());
  const aiEnabled = useUIStore((s) => s.aiEnabled);
  const consoleOpen = useUIStore((s) => s.consoleOpen);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const exploreOpen = useUIStore((s) => s.exploreOpen);
  const moodPanelOpen = useUIStore((s) => s.moodPanelOpen);

  useEffect(() => {
    applySavedMoodSettings();
    useUIStore.getState().setAiEnabled(
      getSetting(SettingsKey.AiEnabled) === 'true'
    );

    if (servicesReady) return;

    (async () => {
      await initServices();
      useMoodStore.getState().loadMoods();
      seedTutorialCrux();
      hideSplashScreen();
      setServicesReady(true);
    })();
  }, [servicesReady]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Escape → open console (when AI enabled and console not already open)
      if (e.key === 'Escape' && !consoleOpen && aiEnabled) {
        setConsoleOpen(true);
        return;
      }

      // Cmd+E → toggle explore
      if (meta && e.key === 'e') {
        e.preventDefault();
        useUIStore.getState().setExploreOpen(!useUIStore.getState().exploreOpen);
        return;
      }

      // Cmd+M → toggle mood
      if (meta && e.key === 'm') {
        e.preventDefault();
        useUIStore.getState().setMoodPanelOpen(!useUIStore.getState().moodPanelOpen);
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
        {servicesReady ? <Outlet /> : null}
      </main>

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

      {/* Mood Modal */}
      <Modal
        open={moodPanelOpen}
        onClose={() => useUIStore.getState().setMoodPanelOpen(false)}
        size="screen"
        title="Mood"
      >
        <Suspense fallback={null}>
          <Mood />
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
