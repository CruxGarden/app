import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore, DEFAULT_PANE_ORDER } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import { useAppStore } from '@/stores/appStore';
import IconButton from '@/components/ui/IconButton';
import UserMenu from '@/components/auth/UserMenu';
import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { ConsoleAvatar } from '@/components/keeper/Console';
import { SearchIcon, MoodIcon, ChevronRightIcon } from '@/components/ui/icons';
import { PANE_VAR_PREFIX, PANE_BUTTONS } from '@/components/workspace/paneConfig';
import { Capability, can } from '@/lib/platform';
import { useShallow } from 'zustand/react/shallow';

export default function TopBar() {
  const navigate = useNavigate();
  const { paneOrder, paneVisibility, togglePane, activeCruxId } = useUIStore(
    useShallow((s) => ({
      paneOrder: s.paneOrder,
      paneVisibility: s.paneVisibility,
      togglePane: s.togglePane,
      activeCruxId: s.activeCruxId,
    })),
  );
  const cruxTitle = useCruxStore((s) => s.crux?.title);
  const updateCrux = useCruxStore((s) => s.updateCrux);
  const username = useAppStore((s) => s.author?.username);
  const aiEnabled = useUIStore((s) => s.aiEnabled);

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

  const desktopChrome = can(Capability.DesktopChrome);

  return (
    <header
      className={cn(
        'flex items-center justify-between px-3 border-b border-toolbar-border bg-toolbar',
        desktopChrome ? 'h-12 pl-24' : 'h-12', // left padding for macOS traffic lights
      )}
      style={desktopChrome ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
    >
      {/* Left: branding + breadcrumb */}
      <div
        className="flex items-center gap-1.5 min-w-0"
        style={desktopChrome ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
      >
        {username ? (
          <button
            onClick={() => navigate('/home')}
            className="shrink-0 text-xs font-medium font-display text-accent cursor-pointer whitespace-nowrap hover:underline"
          >
            {username}
          </button>
        ) : (
          <button
            onClick={() => navigate('/')}
            className="shrink-0 cursor-pointer text-sm font-display font-medium text-toolbar-text whitespace-nowrap hover:underline"
          >
            {APP_NAME}
          </button>
        )}
        {activeCruxId ? (
          <>
            <span className="text-toolbar-text-muted shrink-0">
              <ChevronRightIcon />
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
                className="text-xs font-medium font-display text-toolbar-text bg-transparent border-b border-input-border-active outline-none w-32"
              />
            ) : (
              <span
                onDoubleClick={(e) => {
                  e.preventDefault();
                  startEditTitle();
                }}
                className="text-xs font-medium font-display text-toolbar-text-muted cursor-default whitespace-nowrap"
                title="Double-click to rename"
              >
                {cruxTitle || 'Untitled'}
              </span>
            )}
          </>
        ) : null}
      </div>

      {/* Right: pane toggles + console + user menu */}
      <div
        className="flex items-center gap-1"
        style={desktopChrome ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
      >
        {activeCruxId && (
          <>
            <div className="flex items-center">
              {/* Enabled panes — in paneOrder */}
              <div className="flex items-center gap-1">
                {enabledPanes.map((paneType) => {
                  const config = PANE_BUTTONS.find((b) => b.type === paneType)!;
                  const Icon = config.icon;
                  const prefix = PANE_VAR_PREFIX[paneType];
                  return (
                    <IconButton
                      key={paneType}
                      label={`Toggle ${config.label.toLowerCase()}`}
                      size="sm"
                      onClick={() => togglePane(paneType)}
                      active
                      style={{
                        color: `var(${prefix}-button-icon-active)`,
                        backgroundColor: `var(${prefix}-button-active)`,
                        borderColor: `var(${prefix}-button-border-active)`,
                      }}
                      tooltip={{ label: config.label }}
                    >
                      <Icon />
                    </IconButton>
                  );
                })}
              </div>

              {/* Divider between enabled and disabled */}
              {disabledPanes.length > 0 && enabledPanes.length > 0 && (
                <div className="w-px h-5 bg-toolbar-divider mx-1.5" />
              )}

              {/* Disabled panes — fixed default order, not draggable */}
              {disabledPanes.length > 0 && (
                <div className="flex items-center gap-1">
                  {disabledPanes.map((paneType) => {
                    const config = PANE_BUTTONS.find((b) => b.type === paneType)!;
                    const Icon = config.icon;
                    const prefix = PANE_VAR_PREFIX[paneType];
                    return (
                      <IconButton
                        key={paneType}
                        label={`Toggle ${config.label.toLowerCase()}`}
                        size="sm"
                        onClick={() => togglePane(paneType)}
                        active={false}
                        style={{ color: `var(${prefix}-button-icon)` }}
                        tooltip={{ label: config.label }}
                      >
                        <Icon />
                      </IconButton>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="w-px h-5 bg-toolbar-divider mx-1" />
          </>
        )}
        <IconButton
          label="Explore"
          size="sm"
          onClick={() => useUIStore.getState().setExploreOpen(true)}
          tooltip={{ label: 'Explore', shortcut: 'K' }}
        >
          <SearchIcon />
        </IconButton>
        <IconButton
          label="Mood Builder"
          size="sm"
          onClick={() => navigate('/mood')}
          tooltip={{ label: 'Mood Builder', shortcut: 'M' }}
        >
          <MoodIcon />
        </IconButton>
        {aiEnabled && (
          <>
            <div className="w-px h-5 bg-toolbar-divider mx-1" />
            <div className="relative group/btn flex items-center">
              <button
                onClick={() => useUIStore.getState().toggleConsole()}
                aria-label="Console"
                className={cn(
                  'w-6 h-6 rounded-[var(--radius-sm)] overflow-hidden',
                  'ring-1 ring-text-muted/20 hover:ring-accent/40 transition-shadow cursor-pointer',
                )}
              >
                <ConsoleAvatar className="w-6 h-6" />
              </button>
              <div className="absolute top-full right-0 mt-2 z-50 pointer-events-none hidden group-hover/btn:block">
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius)] bg-tooltip border border-tooltip-border shadow-lg whitespace-nowrap">
                  <span className="text-xs font-medium text-tooltip-text">Console</span>
                  <kbd className="text-[11px] font-mono text-tooltip-text px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-bg border border-tooltip-border min-w-[1.5rem] text-center">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>
          </>
        )}
        <div className="w-px h-5 bg-toolbar-divider mx-1" />
        <UserMenu />
      </div>
    </header>
  );
}
