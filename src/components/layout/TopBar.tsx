import { useThemeStore } from '@/stores/themeStore';
import { useUIStore } from '@/stores/uiStore';
import IconButton from '@/components/ui/IconButton';
import UserMenu from '@/components/auth/UserMenu';

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  );
}

function GateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V8" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
      <circle cx="12" cy="5" r="3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

interface TopBarProps {
  title?: string;
}

export default function TopBar({ title }: TopBarProps) {
  const { resolved, setMode } = useThemeStore();
  const { sidebarOpen, toggleSidebar, toggleTimeline, toggleFileViewer } = useUIStore();

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-surface/30 backdrop-blur-[var(--glass-blur)]">
      <div className="flex items-center gap-2">
        {!sidebarOpen && (
          <IconButton label="Toggle sidebar" size="sm" onClick={toggleSidebar}>
            <MenuIcon />
          </IconButton>
        )}
        {title ? (
          <h1 className="text-sm font-medium font-display text-text">{title}</h1>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <IconButton label="Toggle gate timeline" size="sm" onClick={toggleTimeline}>
          <GateIcon />
        </IconButton>
        <IconButton label="Toggle file viewer" size="sm" onClick={toggleFileViewer}>
          <FileIcon />
        </IconButton>
        <IconButton
          label="Toggle theme"
          size="sm"
          onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}
        >
          {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
        </IconButton>
        <UserMenu />
      </div>
    </header>
  );
}
