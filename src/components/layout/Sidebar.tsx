import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useCruxStore } from '@/stores/cruxStore';
import { DEFAULT_PANE_ORDER } from '@/stores/uiStore';
import Logo from '@/components/brand/Logo';
import CruxBloom from '@/components/brand/CruxBloom';

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function SidebarLink({ to, children }: { to: string; children: React.ReactNode }) {
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
  const createCrux = useCruxStore((s) => s.createCrux);

  const handleNewCrux = async () => {
    const crux = await createCrux();

    // Set initial pane layout based on whether user has an API key
    const hasApiKey = !!localStorage.getItem('cruxgarden:anthropicApiKey');
    const visibility: Record<string, boolean> = {};
    for (const pane of DEFAULT_PANE_ORDER) visibility[pane] = false;

    if (hasApiKey) {
      visibility.collaboration = true;
      visibility.details = true;
    } else {
      visibility.artifacts = true;
      visibility.workshop = true;
    }

    localStorage.setItem(
      `cruxgarden:layout:${crux.id}`,
      JSON.stringify({ paneOrder: DEFAULT_PANE_ORDER, paneVisibility: visibility }),
    );

    navigate(`/crux/${crux.id}`);
  };

  return (
    <aside className="flex flex-col w-56 h-full border-r border-border bg-surface-solid">
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
    </aside>
  );
}
