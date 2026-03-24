import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import KeeperConsole from '@/components/keeper/KeeperConsole';
import { applySavedMoodSettings } from '@/components/mood/MoodEditorPanel';
import { Modal } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { isServicesReady, initServices } from '@/services';
import { getSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { seedTutorialCrux } from '@/services/seedTutorial';
import { useMoodStore } from '@/stores/moodStore';

const Settings = lazy(() => import('@/pages/Settings'));
const Explore = lazy(() => import('@/pages/Explore'));
const MoodEditor = lazy(() => import('@/components/mood/MoodEditorPanel'));

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
  const keeperOpen = useUIStore((s) => s.keeperOpen);
  const setKeeperOpen = useUIStore((s) => s.setKeeperOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const exploreOpen = useUIStore((s) => s.exploreOpen);
  const moodEditorOpen = useUIStore((s) => s.moodEditorOpen);

  // Initialize services and apply mood settings
  useEffect(() => {
    if (servicesReady) {
      applySavedMoodSettings();
      useUIStore.getState().setAiEnabled(getSetting(SettingsKey.AiEnabled) === 'true');
      return;
    }

    (async () => {
      applySavedMoodSettings();
      await initServices();
      useMoodStore.getState().loadMoods();
      seedTutorialCrux();
      useUIStore.getState().setAiEnabled(getSetting(SettingsKey.AiEnabled) === 'true');
      setServicesReady(true);
      hideSplashScreen();
    })();
  }, [servicesReady]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !keeperOpen && aiEnabled) {
        setKeeperOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keeperOpen, setKeeperOpen, aiEnabled]);

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

      {/* Keeper Console — hidden when AI tools are disabled */}
      {aiEnabled && <KeeperConsole open={keeperOpen} onClose={() => setKeeperOpen(false)} />}

      {/* Mood Editor Modal */}
      <Modal
        open={moodEditorOpen}
        onClose={() => useUIStore.getState().setMoodEditorOpen(false)}
        size="screen"
        title="Mood"
      >
        <Suspense fallback={null}>
          <MoodEditor />
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
