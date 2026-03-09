import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import { LoadingPanel } from '@/components/ui';
import KeeperConsole from '@/components/keeper/KeeperConsole';
import { useUIStore } from '@/stores/uiStore';
import { isServicesReady, initServices, ensureLocalAuthor, getBackend } from '@/services';
import { migrateApiKeyFromLocalStorage } from '@/ai/keys';
import { useAuthStore } from '@/stores/authStore';

export default function AppShell() {
  const [commandOpen, setCommandOpen] = useState(false);
  const [servicesOk, setServicesOk] = useState(isServicesReady());
  const keeperOpen = useUIStore((s) => s.keeperOpen);
  const setKeeperOpen = useUIStore((s) => s.setKeeperOpen);

  // Lazily initialize local services when entering app routes
  useEffect(() => {
    if (servicesOk) return;
    (async () => {
      await initServices();
      migrateApiKeyFromLocalStorage().catch(() => {});
      if (getBackend() === 'local' && !useAuthStore.getState().author) {
        const localAuthor = await ensureLocalAuthor();
        useAuthStore.setState({ author: localAuthor });
      }
      setServicesOk(true);
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
        {servicesOk ? <Outlet /> : (
          <div className="flex items-center justify-center h-full">
            <LoadingPanel />
          </div>
        )}
      </main>

      {/* Command palette */}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      {/* Keeper Console */}
      <KeeperConsole open={keeperOpen} onClose={() => setKeeperOpen(false)} />
    </div>
  );
}
