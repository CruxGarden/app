import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore, PANE_COLORS, DEFAULT_PANE_ORDER, type PaneType } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import IconButton from '@/components/ui/IconButton';
import UserMenu from '@/components/auth/UserMenu';
import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { KeeperAvatar } from '@/components/keeper/KeeperConsole';

function StackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="7" y1="20" x2="7" y2="4" />
      <polyline points="3 8 7 4 11 8" />
      <line x1="17" y1="4" x2="17" y2="20" />
      <polyline points="13 16 17 20 21 16" />
    </svg>
  );
}

function PublishIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="5" r="3" />
      <circle cx="12" cy="19" r="3" />
      <path d="M8.59 7.41L12 16M15.41 7.41L12 16" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Pane button config ──────────────────────────────────

const PANE_BUTTONS: { type: PaneType; icon: React.FC; label: string }[] = [
  { type: 'collaboration', icon: ChatIcon, label: 'Collaboration' },
  { type: 'artifacts', icon: FolderIcon, label: 'Artifacts' },
  { type: 'workshop', icon: CodeIcon, label: 'Workshop' },
  { type: 'details', icon: TagIcon, label: 'Metadata' },
  { type: 'history', icon: StackIcon, label: 'History' },
  { type: 'export', icon: ExportIcon, label: 'Export' },
  { type: 'sync', icon: SyncIcon, label: 'Sync' },
  { type: 'publish', icon: PublishIcon, label: 'Publish' },
];

export default function TopBar() {
  const navigate = useNavigate();
  const { paneOrder, paneVisibility, togglePane, activeCruxId } = useUIStore();
  const cruxTitle = useCruxStore((s) => s.crux?.title);
  const updateCrux = useCruxStore((s) => s.updateCrux);
  const username = useAuthStore((s) => s.author?.username);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Split panes into enabled (in paneOrder) and disabled (in default order)
  const enabledPanes = paneOrder.filter((p) => paneVisibility[p]);
  const disabledPanes = DEFAULT_PANE_ORDER.filter((p) => !paneVisibility[p]);

  const startEditTitle = useCallback(() => {
    setTitleDraft(cruxTitle || '');
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  }, [cruxTitle]);

  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== cruxTitle) {
      updateCrux({ title: trimmed });
    }
  }, [titleDraft, cruxTitle, updateCrux]);

  return (
    <header className="flex items-center justify-between h-12 px-3 border-b border-border bg-surface-solid">
      {/* Left: branding + breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          onClick={() => navigate('/')}
          className="shrink-0 cursor-pointer text-sm font-display font-medium text-text whitespace-nowrap hover:underline"
        >
          {APP_NAME}
        </button>
        {username ? (
          <>
            <span className="text-text-muted shrink-0">
              <ChevronIcon />
            </span>
            <button
              onClick={() => navigate('/home')}
              className="shrink-0 text-xs font-medium font-display text-accent cursor-pointer whitespace-nowrap hover:underline"
            >
              {username}
            </button>
          </>
        ) : null}
        {activeCruxId ? (
          <>
            <span className="text-text-muted shrink-0">
              <ChevronIcon />
            </span>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTitle();
                  }
                  if (e.key === 'Escape') {
                    setEditingTitle(false);
                  }
                }}
                className="text-xs font-medium font-display text-text bg-transparent border-b border-accent outline-none w-32"
              />
            ) : (
              <span
                onDoubleClick={(e) => {
                  e.preventDefault();
                  startEditTitle();
                }}
                className="text-xs font-medium font-display text-text-muted cursor-default whitespace-nowrap"
                title="Double-click to rename"
              >
                {cruxTitle || 'Untitled'}
              </span>
            )}
          </>
        ) : null}
      </div>

      {/* Right: pane toggles + keeper + user menu */}
      <div className="flex items-center gap-1">
        {activeCruxId && (
          <>
            <div className="flex items-center">
              {/* Enabled panes — in paneOrder */}
              <div className="flex items-center gap-1">
                {enabledPanes.map((paneType) => {
                  const config = PANE_BUTTONS.find((b) => b.type === paneType)!;
                  const Icon = config.icon;
                  return (
                    <IconButton
                      key={paneType}
                      label={`Toggle ${config.label.toLowerCase()}`}
                      size="sm"
                      onClick={() => togglePane(paneType)}
                      active
                      activeColor={PANE_COLORS[paneType]}
                      tooltip={{ label: config.label }}
                    >
                      <Icon />
                    </IconButton>
                  );
                })}
              </div>

              {/* Divider between enabled and disabled */}
              {disabledPanes.length > 0 && enabledPanes.length > 0 && (
                <div className="w-px h-5 bg-text-muted/20 mx-1.5" />
              )}

              {/* Disabled panes — fixed default order, not draggable */}
              {disabledPanes.length > 0 && (
                <div className="flex items-center gap-1">
                  {disabledPanes.map((paneType) => {
                    const config = PANE_BUTTONS.find((b) => b.type === paneType)!;
                    const Icon = config.icon;
                    return (
                      <IconButton
                        key={paneType}
                        label={`Toggle ${config.label.toLowerCase()}`}
                        size="sm"
                        onClick={() => togglePane(paneType)}
                        active={false}
                        activeColor={PANE_COLORS[paneType]}
                        tooltip={{ label: config.label }}
                      >
                        <Icon />
                      </IconButton>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="w-px h-5 bg-text-muted/20 mx-1" />
          </>
        )}
        <div className="relative group/btn flex items-center">
          <button
            onClick={() => useUIStore.getState().toggleKeeper()}
            aria-label="The Keeper"
            className={cn(
              'w-6 h-6 rounded-full overflow-hidden',
              'ring-1 ring-text-muted/20 hover:ring-accent/40 transition-shadow cursor-pointer',
            )}
          >
            <KeeperAvatar className="w-6 h-6" />
          </button>
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none hidden group-hover/btn:block">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius)] bg-surface-solid border border-border shadow-lg whitespace-nowrap">
              <span className="text-xs font-medium text-text">The Keeper</span>
              <kbd className="text-[11px] font-mono text-text-muted px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-bg border border-border min-w-[1.5rem] text-center">Esc</kbd>
            </div>
          </div>
        </div>
        <div className="w-px h-5 bg-text-muted/20 mx-1" />
        <UserMenu />
      </div>
    </header>
  );
}
