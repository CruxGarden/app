import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MeshBackground from './MeshBackground';
import CommandPalette from './CommandPalette';

export default function AppShell() {
  const { sidebarOpen, setSidebar } = useUIStore();
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
    <div className="flex h-screen overflow-hidden">
      <MeshBackground />

      {/* Sidebar — push on desktop, overlay on mobile */}
      <div
        className={cn(
          'relative z-10 shrink-0 transition-all duration-200',
          'hidden md:block',
          sidebarOpen ? 'w-56' : 'w-0 overflow-hidden',
        )}
      >
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-bg/60 backdrop-blur-[var(--glass-blur)]" onClick={() => setSidebar(false)} />
          <div className="relative w-56 h-full bg-surface border-r border-border z-50">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="relative z-10 flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Command palette */}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
