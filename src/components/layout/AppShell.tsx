import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import MeshBackground from './MeshBackground';
import CommandPalette from './CommandPalette';
import { useUIStore, type PaneType } from '@/stores/uiStore';

const PANE_SHORTCUTS: PaneType[] = [
  'history', 'collaboration', 'artifacts', 'workshop',
  'details', 'sync', 'publish', 'export',
];

export default function AppShell() {
  const [commandOpen, setCommandOpen] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      // Cmd+K — command palette
      if (e.key === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
        return;
      }

      // Cmd+1..8 — toggle panes
      const num = parseInt(e.key, 10);
      const pane = PANE_SHORTCUTS[num - 1];
      if (pane && useUIStore.getState().activeCruxId) {
        e.preventDefault();
        useUIStore.getState().togglePane(pane);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <MeshBackground />

      {/* Top bar */}
      <div className="relative z-20 shrink-0">
        <TopBar />
      </div>

      {/* Main content */}
      <main className="relative z-10 flex-1 min-h-0">
        <Outlet />
      </main>

      {/* Command palette */}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
