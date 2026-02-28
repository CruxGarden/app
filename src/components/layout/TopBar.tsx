import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore, PANE_COLORS, DEFAULT_PANE_ORDER, type PaneType } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import IconButton from '@/components/ui/IconButton';
import UserMenu from '@/components/auth/UserMenu';

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

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function PublishIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Pane button config ──────────────────────────────────

const PANE_BUTTONS: { type: PaneType; icon: React.FC; label: string }[] = [
  { type: 'history', icon: StackIcon, label: 'History' },
  { type: 'collaboration', icon: ChatIcon, label: 'Collaboration' },
  { type: 'artifacts', icon: FolderIcon, label: 'Artifacts' },
  { type: 'workshop', icon: CodeIcon, label: 'Workshop' },
  { type: 'details', icon: InfoIcon, label: 'Details' },
  { type: 'sync', icon: SyncIcon, label: 'Sync' },
  { type: 'publish', icon: PublishIcon, label: 'Publish' },
  { type: 'export', icon: ExportIcon, label: 'Export' },
];

const SHORTCUT_MAP: Record<PaneType, string> = {
  history: '1', collaboration: '2', artifacts: '3', workshop: '4',
  details: '5', sync: '6', publish: '7', export: '8',
};

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
    <header className="flex items-center justify-between h-12 px-3 border-b border-border bg-surface/30 backdrop-blur-[var(--glass-blur)]">
      {/* Left: branding + breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          onClick={() => navigate('/')}
          className="shrink-0 hover:opacity-80 transition-opacity cursor-pointer text-sm font-display font-medium text-text whitespace-nowrap"
        >
          crux.garden
        </button>
        {username ? (
          <>
            <span className="text-text-muted shrink-0"><ChevronIcon /></span>
            <button
              onClick={() => navigate('/garden')}
              className="shrink-0 text-xs font-medium font-display text-text-muted hover:text-text transition-colors cursor-pointer whitespace-nowrap"
            >
              @{username}
            </button>
          </>
        ) : null}
        {activeCruxId ? (
          <>
            <span className="text-text-muted shrink-0"><ChevronIcon /></span>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                  if (e.key === 'Escape') { setEditingTitle(false); }
                }}
                className="text-xs font-medium font-display text-text bg-transparent border-b border-accent outline-none w-32"
              />
            ) : (
              <button
                onClick={() => navigate(`/crux/${activeCruxId}`)}
                onDoubleClick={(e) => { e.preventDefault(); startEditTitle(); }}
                className="text-xs font-medium font-display text-text-muted hover:text-text transition-colors cursor-pointer whitespace-nowrap"
                title="Double-click to rename"
              >
                {cruxTitle || 'Untitled'}
              </button>
            )}
          </>
        ) : null}
      </div>

      {/* Right: pane toggles + user menu */}
      <div className="flex items-center gap-1">
        {activeCruxId && (
          <div className="flex items-center">
            {/* Enabled panes — in paneOrder */}
            <div className="flex items-center gap-0.5">
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
                    tooltip={{ label: config.label, shortcut: SHORTCUT_MAP[paneType] }}
                  >
                    <Icon />
                  </IconButton>
                );
              })}
            </div>

            {/* Divider between enabled and disabled */}
            <div className="w-px h-5 bg-text-muted/20 mx-1.5" />

            {/* Disabled panes — fixed default order, not draggable */}
            <div className="flex items-center gap-0.5">
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
                    tooltip={{ label: config.label, shortcut: SHORTCUT_MAP[paneType] }}
                  >
                    <Icon />
                  </IconButton>
                );
              })}
            </div>
          </div>
        )}
        {activeCruxId && <div className="w-px h-5 bg-text-muted/30 mx-1" />}
        <UserMenu />
      </div>
    </header>
  );
}
