import { useGardenContext } from '@/stores/gardenContext';
import GardenLocation from './GardenLocation';
import NavigationHistory from './NavigationHistory';
import { useUIStore, useWorkspaceUIStore, type PaneType } from '@/stores/uiStore';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import AlertsBell from '@/components/tending/AlertsBell';
import TimerChip from '@/components/tending/TimerChip';
import PanelPicker from './PanelPicker';
import { COMMAND_SHORTCUT } from './command-score';
import { openCommandPalette } from '@/stores/commandPalette';
import { usePaneLabels } from '@/hooks/usePaneLabels';
import IconButton from '@/components/ui/IconButton';
import UserMenu from '@/components/auth/UserMenu';
import { cn } from '@/lib/cn';
import { ConsoleAvatar } from '@/components/keeper/Console';
import KeeperActivity from '@/components/keeper/KeeperActivity';
import MoodBar from '@/components/mood/MoodBar';
import { ChevronRightIcon, PlusCircleIcon, SearchIcon } from '@/components/ui/icons';
import { PANES } from '@/components/workspace/paneConfig';
import { Capability, can } from '@/lib/platform';
import { useShallow } from 'zustand/react/shallow';
import { usePinned } from '@/stores/pins';

/** Panes with their own control in the bar: the Navigator, the Mood chip, the Keeper. */
const OWN_BUTTON = new Set<PaneType>(['navigator', 'mood', 'console']);
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/**
 * The top bar, calm (UX pass 2, 2026-09-27): where you are on the left; in the
 * middle one command bar — ⌘K for everything, then the square toggles of the
 * open and pinned panels and the Panels picker; on the right what is yours —
 * alerts, the Mood (theme and sound in one chip), the Keeper, the account.
 * Explore and Tending are panels: the picker and ⌘K open them.
 */
export default function TopBar() {
  const { paneOrder, paneVisibility, togglePane, activeCruxId, scope } = useWorkspaceUIStore(
    useShallow((s) => ({
      paneOrder: s.paneOrder,
      paneVisibility: s.paneVisibility,
      togglePane: s.togglePane,
      activeCruxId: s.activeCruxId,
      scope: s.workspaceScope,
    })),
  );
  const garden = useGardenContext((s) => s.garden);
  const navigatorOpen = useGardenContext((s) => s.navigatorOpen);
  // The garden's own title, if it has one; the pane names as the garden calls them.
  const paneLabels = usePaneLabels();
  const aiEnabled = useUIStore((s) => s.aiEnabled);

  // The squares mirror the visible workspace plus pinned panels; the rest live
  // in the picker and in ⌘K.
  const pinned = usePinned(scope);
  // Open panes in their arrangement's order, then pinned ones that are closed.
  const enabledPanes = [
    ...paneOrder.filter((p) => paneVisibility[p]),
    ...pinned.filter((p) => !paneVisibility[p]),
  ].filter((p) => !OWN_BUTTON.has(p));

  const desktopChrome = can(Capability.DesktopChrome);
  const noDrag = desktopChrome ? NO_DRAG : undefined;

  return (
    <header
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 px-3 border-b border-toolbar-border bg-toolbar',
        desktopChrome && 'pl-24', // left padding for macOS traffic lights
      )}
      style={{
        minHeight: 'var(--toolbar-height)',
        ...(desktopChrome ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : {}),
      }}
    >
      {/* Left: where you are */}
      <div className="flex flex-1 basis-60 min-w-0 items-center">
        <nav
          aria-label="Workspace breadcrumbs"
          className="flex items-center gap-1.5 min-w-0"
          style={noDrag}
        >
          <IconButton
            label="Navigator"
            size="sm"
            active={navigatorOpen}
            onClick={() => useGardenContext.getState().setNavigatorOpen(!navigatorOpen)}
            tooltip={{ label: 'Navigator' }}
          >
            <PlusCircleIcon />
          </IconButton>
          <NavigationHistory />
          <GardenLocation />
          {scope === 'crux' && activeCruxId && (
            <span className="text-toolbar-text-muted shrink-0">
              <ChevronRightIcon />
            </span>
          )}
          <WorkspaceSwitcher />
          <TimerChip />
        </nav>
      </div>

      {/* Middle: one command bar — ⌘K, the panel squares, the picker */}
      <div
        className="flex items-center gap-3 min-h-8 px-1"
        data-testid="command-bar"
        style={noDrag}
      >
        <button
          type="button"
          aria-label="Search or run a command"
          aria-keyshortcuts="Meta+K Control+K"
          onClick={() => openCommandPalette()}
          className={cn(
            'group/cmd flex items-center gap-2 h-8 px-2 rounded-[var(--radius-sm)] cursor-pointer',
            'text-toolbar-text-muted hover:text-toolbar-text hover:bg-icon-button-hover',
            'transition-[color,background-color] motion-press',
          )}
        >
          <SearchIcon size={14} />
          <span className="hidden lg:inline text-xs pr-6">Search or run a command</span>
          <kbd className="hidden sm:inline-flex items-center leading-none text-3xs font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-mood-bar-border text-toolbar-text-muted group-hover/cmd:text-toolbar-text transition-colors">
            {COMMAND_SHORTCUT}
          </kbd>
        </button>
        {enabledPanes.length > 0 && (
          <>
            {/* The builder's lane: open and pinned panels as square toggles. */}
            <div
              className="hidden md:flex flex-wrap items-center gap-1.5"
              aria-label="Open panels"
              data-testid="builder-lane"
            >
              {enabledPanes.map((paneType) => {
                const { icon: Icon, label, prefix } = PANES[paneType];
                const open = paneVisibility[paneType];
                return (
                  <IconButton
                    key={paneType}
                    label={`Toggle ${label.toLowerCase()}`}
                    size="sm"
                    onClick={(e) => {
                      // Keep keyboard focus in the bar if this button disappears.
                      if (open && !pinned.includes(paneType))
                        e.currentTarget
                          .closest('header')
                          ?.querySelector<HTMLButtonElement>('[aria-label="Add panel"]')
                          ?.focus();
                      togglePane(paneType);
                    }}
                    active={open}
                    className="pane-toggle"
                    style={
                      {
                        color: open
                          ? `var(${prefix}-button-icon-active)`
                          : `var(${prefix}-button-icon)`,
                        backgroundColor: open ? `var(${prefix}-button-active)` : undefined,
                        borderColor: open ? `var(${prefix}-button-border-active)` : undefined,
                        '--pt-hover': `var(${prefix}-button-hover)`,
                        '--pt-hover-icon': `var(${prefix}-button-icon-hover)`,
                        '--pt-hover-border': `var(${prefix}-button-border-hover)`,
                      } as React.CSSProperties
                    }
                    tooltip={{ label: paneLabels[paneType] }}
                  >
                    <Icon />
                  </IconButton>
                );
              })}
            </div>
          </>
        )}
        <PanelPicker key={activeCruxId || garden?.id} />
      </div>

      {/* Right: what is yours */}
      <div className="flex flex-1 basis-60 min-w-0 items-center justify-end">
        <div className="flex items-center gap-3" style={noDrag}>
          <AlertsBell />
          <MoodBar />
          {aiEnabled && (
            <>
              <KeeperActivity />
              <div className="relative group/btn flex items-center">
                <button
                  onClick={() => togglePane('console')}
                  aria-label="Console"
                  aria-pressed={paneVisibility.console}
                  className={cn(
                    'w-6 h-6 rounded-[var(--radius-sm)] overflow-hidden',
                    'ring-1 hover:ring-2 hover:ring-accent/40 active-dim motion-press cursor-pointer',
                    paneVisibility.console ? 'ring-accent/60' : 'ring-text-muted/20',
                  )}
                >
                  <ConsoleAvatar className="w-6 h-6" />
                </button>
                <div
                  aria-hidden
                  className="tooltip-reveal absolute top-full right-0 mt-2 z-50 pointer-events-none"
                >
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-tooltip bg-tooltip border border-tooltip-border shadow-tooltip whitespace-nowrap">
                    <span className="text-xs font-medium text-tooltip-text">Console</span>
                    <kbd className="text-xxs font-mono text-tooltip-text px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-bg border border-tooltip-border min-w-[1.5rem] text-center">
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
      </div>
    </header>
  );
}
