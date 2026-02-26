import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useCruxStore } from '@/stores/cruxStore';
import Logo from '@/components/brand/Logo';
import CruxBloom from '@/components/brand/CruxBloom';

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SidebarLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-body',
          'transition-colors duration-150',
          isActive
            ? 'bg-accent-muted text-accent'
            : 'text-text-muted hover:text-text hover:bg-surface',
        )
      }
    >
      {children}
    </NavLink>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const author = useAuthStore((s) => s.author);

  const createCrux = useCruxStore((s) => s.createCrux);

  const handleNewCrux = async () => {
    const crux = await createCrux();
    navigate(`/crux/${crux.id}`);
  };

  return (
    <aside className="flex flex-col w-56 h-full border-r border-border bg-surface/50 backdrop-blur-[var(--glass-blur)]">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border">
        <Logo size="sm" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 p-3">
        <SidebarLink to="/garden">
          <CruxBloom size={18} />
          Garden
        </SidebarLink>

        <button
          onClick={handleNewCrux}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-body',
            'text-text-muted hover:text-text hover:bg-surface',
            'transition-colors duration-150 cursor-pointer',
            'w-full text-left',
          )}
        >
          <PlusIcon />
          New Crux
        </button>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 flex flex-col gap-1">
        <SidebarLink to="/settings">
          <SettingsIcon />
          Settings
        </SidebarLink>
        {author ? (
          <div className="px-3 py-1.5 text-xs text-text-muted truncate">
            @{author.username}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
