import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import KeeperConsole from '@/components/keeper/KeeperConsole';
import MoodBar, { applySavedMoodSettings } from '@/components/mood/MoodEditorPanel';
import { useUIStore } from '@/stores/uiStore';
import { isServicesReady, initServices } from '@/services';
import { seedTutorialCrux } from '@/services/seedTutorial';
import { migrateApiKeyFromLocalStorage } from '@/ai/keys';
import { useMoodStore } from '@/stores/moodStore';

// Apply mood palette at module load time — before first React render.
// Reads from localStorage (synchronous), so no flash.
applySavedMoodSettings();

export default function Shell() {
  const [commandOpen, setCommandOpen] = useState(false);
  const [servicesOk, setServicesOk] = useState(isServicesReady());
  const keeperOpen = useUIStore((s) => s.keeperOpen);
  const setKeeperOpen = useUIStore((s) => s.setKeeperOpen);

  // Lazily initialize local services when entering app routes
  useEffect(() => {
    if (servicesOk) return;
    (async () => {
      const t0 = performance.now();
      await initServices();
      console.log(`[init] initServices: ${(performance.now() - t0).toFixed(0)}ms`);
      const t1 = performance.now();
      migrateApiKeyFromLocalStorage().catch(() => {});
      console.log(`[init] post-init: ${(performance.now() - t1).toFixed(0)}ms`);
      const t2 = performance.now();
      useMoodStore.getState().loadMoods().catch(() => {});
      seedTutorialCrux().catch(() => {});
      console.log(`[init] loadMoods+seed: ${(performance.now() - t2).toFixed(0)}ms`);
      console.log(`[init] TOTAL: ${(performance.now() - t0).toFixed(0)}ms`);
      setServicesOk(true);
      // Dismiss the HTML splash now that everything is ready
      const splash = document.getElementById('splash');
      if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 300);
      }
    })();
  }, [servicesOk]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
        return;
      }

      // Escape — open Keeper Console (when nothing else is open)
      // Note: when Keeper IS open, its own capture-phase handler closes it
      if (e.key === 'Escape' && !keeperOpen && !commandOpen) {
        setKeeperOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keeperOpen, commandOpen, setKeeperOpen]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="relative z-20 shrink-0">
        <TopBar />
      </div>

      {/* Main content */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto">
        {servicesOk ? <Outlet /> : null}
      </main>

      {/* Command palette */}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      {/* Keeper Console */}
      <KeeperConsole open={keeperOpen} onClose={() => setKeeperOpen(false)} />

      {/* Mood Editor Panel */}
      <MoodBar />
    </div>
  );
}
