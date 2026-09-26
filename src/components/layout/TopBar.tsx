import { useGardenContext } from '@/stores/gardenContext';
import GardenLocation from './GardenLocation';
import NavigationHistory from './NavigationHistory';
import { useUIStore, useWorkspaceUIStore, type PaneType } from '@/stores/uiStore';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import TendingLink from '@/components/tending/TendingLink';
import AlertsBell from '@/components/tending/AlertsBell';
import TimerChip from '@/components/tending/TimerChip';
import PanelPicker from './PanelPicker';
import { usePaneLabels } from '@/hooks/usePaneLabels';
import IconButton from '@/components/ui/IconButton';
import UserMenu from '@/components/auth/UserMenu';
import { cn } from '@/lib/cn';
import { ConsoleAvatar } from '@/components/keeper/Console';
import KeeperActivity from '@/components/keeper/KeeperActivity';
import MoodBar from '@/components/mood/MoodBar';
import { SearchIcon, MoodIcon, ChevronRightIcon, PlusCircleIcon } from '@/components/ui/icons';
import { PANE_VAR_PREFIX, PANE_BUTTONS } from '@/components/workspace/paneConfig';
import { Capability, can } from '@/lib/platform';
import { useShallow } from 'zustand/react/shallow';

const OWN_BUTTON = new Set<PaneType>(['navigator', 'explore', 'mood', 'console']);

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

  // The bar mirrors the visible workspace; closed panels live in the picker.
  // Navigator, Explore, Mood and the Garden's Collaboration have their own buttons.
  const enabledPanes = paneOrder.filter((p) => paneVisibility[p] && !OWN_BUTTON.has(p));

  const desktopChrome = can(Capability.DesktopChrome);

  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-y-1 px-3 border-b border-toolbar-border bg-toolbar',
        desktopChrome && 'pl-24', // left padding for macOS traffic lights
      )}
      style={{
        minHeight: 'var(--toolbar-height)',
        ...(desktopChrome ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : {}),
      }}
    >
      {/* Left: branding + breadcrumb */}
      <nav
        aria-label="Workspace breadcrumbs"
        className="flex flex-1 basis-72 items-center gap-1.5 min-w-0"
        style={desktopChrome ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
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
        <span className="text-toolbar-text-muted shrink-0">
          {scope === 'crux' && activeCruxId && <ChevronRightIcon />}
        </span>
        <WorkspaceSwitcher />
        <div className="hidden xl:block">
          <TendingLink />
        </div>
        <TimerChip />
        <AlertsBell />
      </nav>

      {/* Right: pane toggles + console + user menu */}
      <div
        className="flex flex-wrap min-w-0 items-center gap-1"
        style={desktopChrome ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
      >
        {enabledPanes.length > 0 && (
          <>
            {/* The builder's lane header — the pane toggles — sits in the same
                flat pill as the sound chip (Daniel, 2026-09-20). */}
            <div
              className="hidden md:flex flex-wrap items-center min-h-7 px-1 bg-mood-bar border border-mood-bar-border rounded-[var(--mood-bar-radius)] shadow-mood-bar"
              data-testid="builder-lane"
            >
              {/* Enabled panes — in paneOrder */}
              <div className="flex flex-wrap items-center gap-1" aria-label="Open panels">
                {enabledPanes.map((paneType) => {
                  const config = PANE_BUTTONS.find((b) => b.type === paneType)!;
                  const Icon = config.icon;
                  const prefix = PANE_VAR_PREFIX[paneType];
                  return (
                    <IconButton
                      key={paneType}
                      label={`Toggle ${config.label.toLowerCase()}`}
                      size="sm"
                      onClick={(e) => {
                        // Keep keyboard focus in the bar after this button disappears.
                        e.currentTarget
                          .closest('header')
                          ?.querySelector<HTMLButtonElement>('[aria-label="Add panel"]')
                          ?.focus();
                        togglePane(paneType);
                      }}
                      active
                      className="pane-toggle"
                      style={
                        {
                          color: `var(${prefix}-button-icon-active)`,
                          backgroundColor: `var(${prefix}-button-active)`,
                          borderColor: `var(${prefix}-button-border-active)`,
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
            </div>
            <div className="hidden md:block w-px h-5 bg-toolbar-divider mx-1" />
          </>
        )}
        <div className="hidden xl:block">
          <MoodBar className="mr-1" />
        </div>
        <IconButton
          label="Explore"
          size="sm"
          active={paneVisibility.explore}
          onClick={() => togglePane('explore')}
          tooltip={{ label: 'Explore' }}
        >
          <SearchIcon />
        </IconButton>
        <IconButton
          label="Mood"
          size="sm"
          active={paneVisibility.mood}
          onClick={() => togglePane('mood')}
          tooltip={{ label: 'Mood', shortcut: 'M' }}
        >
          <MoodIcon />
        </IconButton>
        {aiEnabled && (
          <>
            <div className="w-px h-5 bg-toolbar-divider mx-1" />
            <KeeperActivity />
            <div className="relative group/btn flex items-center">
              <button
                onClick={() => togglePane('console')}
                aria-label="Console"
                aria-pressed={paneVisibility.console}
                className={cn(
                  'w-6 h-6 rounded-[var(--radius-sm)] overflow-hidden',
                  'ring-1 hover:ring-accent/40 transition-shadow cursor-pointer',
                  paneVisibility.console ? 'ring-accent/60' : 'ring-text-muted/20',
                )}
              >
                <ConsoleAvatar className="w-6 h-6" />
              </button>
              <div className="absolute top-full right-0 mt-2 z-50 pointer-events-none hidden group-hover/btn:block">
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
        <PanelPicker key={activeCruxId || garden?.id} />
        <UserMenu />
      </div>
    </header>
  );
}
