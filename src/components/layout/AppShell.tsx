import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import MeshBackground from './MeshBackground';
import CommandPalette from './CommandPalette';

export default function AppShell() {
  const [commandOpen, setCommandOpen] = useState(false);

  // Global Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
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
