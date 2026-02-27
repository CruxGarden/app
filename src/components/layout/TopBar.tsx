import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/stores/themeStore';
import { useUIStore } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import IconButton from '@/components/ui/IconButton';
import UserMenu from '@/components/auth/UserMenu';
import PublishButton from '@/components/chat/PublishButton';
import { PaneLayoutMenu } from '@/components/workspace';
import Logo from '@/components/brand/Logo';
import CruxBloom from '@/components/brand/CruxBloom';

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

function StackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

interface TopBarProps {
  title?: string;
}

export default function TopBar({ title }: TopBarProps) {
  const navigate = useNavigate();
  const { resolved, setMode } = useThemeStore();
  const { paneVisibility, togglePane } = useUIStore();
  const crux = useCruxStore((s) => s.crux);
  const createCrux = useCruxStore((s) => s.createCrux);

  const handleNewCrux = async () => {
    const newCrux = await createCrux();
    navigate(`/crux/${newCrux.id}`);
  };

  return (
    <header className="flex items-center justify-between h-12 px-3 border-b border-border bg-surface/30 backdrop-blur-[var(--glass-blur)]">
      {/* Left: branding + nav */}
      <div className="flex items-center gap-1">
        <IconButton label="Garden" size="sm" onClick={() => navigate('/garden')}>
          <CruxBloom size={16} />
        </IconButton>
        <Logo size="sm" className="hidden sm:inline mr-1" />
        <IconButton label="New crux" size="sm" onClick={handleNewCrux}>
          <PlusIcon />
        </IconButton>
        {title ? (
          <h1 className="text-xs font-medium font-display text-text-muted ml-2 truncate max-w-[200px]">{title}</h1>
        ) : null}
      </div>

      {/* Right: pane toggles + actions */}
      <div className="flex items-center gap-1">
        {crux && <PublishButton />}
        <IconButton
          label="Toggle history"
          size="sm"
          onClick={() => togglePane('navigation')}
          active={paneVisibility.navigation}
        >
          <StackIcon />
        </IconButton>
        <IconButton
          label="Toggle conversation"
          size="sm"
          onClick={() => togglePane('chat')}
          active={paneVisibility.chat}
        >
          <ChatIcon />
        </IconButton>
        <IconButton
          label="Toggle artifacts"
          size="sm"
          onClick={() => togglePane('artifacts')}
          active={paneVisibility.artifacts}
        >
          <FolderIcon />
        </IconButton>
        <IconButton
          label="Toggle editor"
          size="sm"
          onClick={() => togglePane('editor')}
          active={paneVisibility.editor}
        >
          <CodeIcon />
        </IconButton>
        <PaneLayoutMenu />
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
