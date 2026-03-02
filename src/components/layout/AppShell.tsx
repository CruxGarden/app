import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import KeeperConsole from '@/components/keeper/KeeperConsole';
import { useUIStore } from '@/stores/uiStore';

export default function AppShell() {
  const [commandOpen, setCommandOpen] = useState(false);
  const keeperOpen = useUIStore((s) => s.keeperOpen);
  const setKeeperOpen = useUIStore((s) => s.setKeeperOpen);

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
        <Outlet />
      </main>

      {/* Command palette */}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      {/* Keeper Console */}
      <KeeperConsole open={keeperOpen} onClose={() => setKeeperOpen(false)} />
    </div>
  );
}
