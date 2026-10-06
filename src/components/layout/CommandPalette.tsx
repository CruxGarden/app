import { useModalFocus } from '@/hooks/useModalFocus';
import { openFieldGuide } from '@/stores/fieldGuide';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useCommandPalette } from '@/stores/commandPalette';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useAdvancedMode } from '@/hooks/useAdvancedMode';
import { usePaneLabels } from '@/hooks/usePaneLabels';
import { gardenPath, inGarden, useGardenContext } from '@/stores/gardenContext';
import { useWorkspaceUIStore, useWorkspaceUIStoreApi, type PaneType } from '@/stores/uiStore';
import { useWorkspaceRegistry } from '@/stores/workspaceRegistry';
import { workspaceSelection } from '@/stores/workspaceSelection';
import { useThemeStore } from '@/stores/themeStore';
import { toast } from '@/stores/toastStore';
import { PANES } from '@/components/workspace/paneConfig';
import { seedExplore } from '@/components/workspace/explore-seed';
import { searchNavigation, type NavigationSearchItem } from '@/services/navigation-search';
import { chooseMood } from '@/services/garden-mood';
import { openSetupAgain } from '@/components/setup/setup-store';
import { BUNDLED_MOODS } from '@/lib/moods/bundled-moods';
import { getInstalledMoods } from '@/lib/moods/packages';
import { requestUi } from '@/lib/ui-requests';
import { shortcut, shortcutText } from '@/lib/shortcuts';
import { openShellDialog } from '@/stores/shellDialogs';
import { newCrux, openSettings } from './app-commands';
import { ThemeMode } from '@/lib/types';
import { cn } from '@/lib/cn';
import {
  ExportIcon,
  HomeIcon,
  MoodIcon,
  MoonIcon,
  PlusCircleIcon,
  PlusIcon,
  SearchIcon,
  ShareIcon,
  SlidersIcon,
  SproutIcon,
  StackIcon,
  SunIcon,
} from '@/components/ui/icons';
import { offeredPanes } from './panel-order';
import {
  COMMAND_SHORTCUT,
  SECTIONS,
  isMac,
  score,
  type Command,
  type Section,
} from './command-score';

/** How many of a long list show for a query; the rest are a word more away. */
const CAP: Partial<Record<Section, number>> = { 'Go to': 8, Moods: 6 };

/** A Crux in a list: its initial on a small tile, as its card shows it without a picture. */
function Initial({ title }: { title: string }) {
  return (
    <span className="w-4 h-4 inline-flex items-center justify-center rounded-[3px] border border-border text-3xs font-medium text-text-muted">
      {(title.trim()[0] ?? '·').toUpperCase()}
    </span>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="text-3xs font-mono text-text-muted px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-border bg-bg">
      {children}
    </kbd>
  );
}

/**
 * ⌘K: one field to go anywhere, open or close any panel, wear a Mood, change
 * a setting or run an action (UX pass 2, 2026-09-27). Gardens and Cruxes come
 * from the same search as the Navigator's; panels from the same list as the
 * Panels picker, so nothing here is reachable only here.
 */
export default function CommandPalette() {
  const { open, initialQuery, close } = useCommandPalette(
    useShallow((s) => ({ open: s.open, initialQuery: s.query, close: s.close })),
  );
  if (!open || typeof document === 'undefined') return null;
  return createPortal(<Palette initialQuery={initialQuery} onClose={close} />, document.body);
}

function Palette({ initialQuery, onClose }: { initialQuery: string; onClose: () => void }) {
  const id = useId();
  const navigate = useMoodNavigate();
  const aiEnabled = useAiEnabled();
  const advancedMode = useAdvancedMode();
  const labels = usePaneLabels();
  const ui = useWorkspaceUIStoreApi();
  const { scope, activeCruxId, visibility } = useWorkspaceUIStore(
    useShallow((s) => ({
      scope: s.workspaceScope,
      activeCruxId: s.activeCruxId,
      visibility: s.paneVisibility,
    })),
  );
  const garden = useGardenContext((s) => s.garden);
  const { entries, activeId } = useWorkspaceRegistry(
    useShallow((s) => ({ entries: s.entries, activeId: s.activeId })),
  );
  const themeMode = useThemeStore((s) => s.activeMode);
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<{ query: string; items: NavigationSearchItem[] }>({
    query: '',
    items: [],
  });
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog, true, 75);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  // Gardens and Cruxes by name, the Navigator's own search, a beat after typing stops.
  const term = query.trim();
  useEffect(() => {
    if (!term) return;
    let current = true;
    const timer = window.setTimeout(() => {
      searchNavigation(term)
        .then((page) => current && setFound({ query: term, items: page.items }))
        .catch(() => current && setFound({ query: term, items: [] }));
    }, 90);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [term]);

  const goTo = useCallback(
    (gardenId: string, cruxId: string | null) =>
      navigate(cruxId ? inGarden(`/c/${cruxId}`, gardenId) : gardenPath(gardenId)),
    [navigate],
  );

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [];
    const inCrux = scope === 'crux' && !!activeCruxId;
    const show = (pane: PaneType) => ui.getState().setPaneVisible(pane, true);

    // ── Go to: Gardens and Cruxes by name, and the open workspaces ──
    const results = found.query && found.query === term ? found.items : [];
    const listed = new Set(results.map((item) => item.id));
    for (const item of results) {
      const label = item.title || (item.kind === 'garden' ? 'Untitled Garden' : 'Untitled');
      out.push({
        id: `find:${item.id}`,
        section: 'Go to',
        label,
        hint: item.location,
        icon: item.kind === 'garden' ? <SproutIcon size={14} /> : <Initial title={label} />,
        run: () =>
          goTo(
            item.kind === 'garden' ? item.id : (garden?.id ?? item.id),
            item.kind === 'garden' ? null : item.id,
          ),
      });
    }
    for (const entry of entries) {
      if (entry.id === activeId && inCrux) continue;
      // A search result already names it.
      if (listed.has(entry.cruxId ?? entry.id)) continue;
      out.push({
        id: `workspace:${entry.id}`,
        section: 'Go to',
        label: entry.title || 'Untitled',
        hint: 'Open workspace',
        keywords: 'switch crux workspace',
        icon: <Initial title={entry.title || 'Untitled'} />,
        run: () => navigate(`/c/${entry.id}`),
      });
    }
    if (inCrux && garden)
      out.push({
        id: 'garden-home',
        section: 'Go to',
        label: garden.title || 'Garden Home',
        hint: 'Garden Home',
        keywords: 'home garden close crux leave',
        icon: <HomeIcon size={14} />,
        run: () => navigate(gardenPath(garden.id)),
      });

    // ── Actions ──
    out.push({
      id: 'advanced-mode-settings',
      section: 'Actions',
      label: 'Advanced Mode settings',
      keywords: 'advanced simple code data controls technical guidance preferences',
      icon: <HomeIcon size={14} />,
      run: () => openSettings({ section: 'start' }),
    });
    out.push({
      id: 'field-guide',
      section: 'Actions',
      label: 'Help and field guide',
      keywords: 'help documentation docs tutorial learn onboarding getting started',
      icon: <HomeIcon size={14} />,
      run: () => openFieldGuide(),
    });
    out.push({
      id: 'setup-again',
      section: 'Actions',
      label: 'Run setup again',
      keywords: 'help setup wizard welcome onboarding garden name collaborator mood start',
      icon: <SproutIcon size={14} />,
      run: () => openSetupAgain(),
    });
    out.push({
      id: 'new-crux',
      section: 'Actions',
      label: 'New Crux…',
      keywords: 'create make start project idea',
      icon: <PlusIcon size={14} />,
      run: () => newCrux(navigate, ui),
    });
    if (inCrux) {
      out.push({
        id: 'new-task',
        section: 'Actions',
        label: 'New task…',
        keywords: 'working copy try branch variation',
        icon: <PlusIcon size={14} />,
        run: () => {
          show('tasks');
          requestUi('new-task');
        },
      });
      out.push({
        id: 'mark-version',
        section: 'Actions',
        label: 'Mark a version',
        keywords: 'snapshot growth save checkpoint history',
        icon: <StackIcon size={14} />,
        run: async () => {
          const data = workspaceSelection.getState().active?.data;
          if (!data) return;
          const state = data.getState();
          if (state.isCreatingGrowth) return;
          state.setGrowthCreating(true);
          try {
            await state.createSnapshot({});
            toast('Marked a version', {
              action: { label: 'Show', run: () => show('history') },
            });
          } finally {
            data.getState().setGrowthCreating(false);
          }
        },
      });
      out.push({
        id: 'share',
        section: 'Actions',
        label: 'Share this Crux',
        keywords: 'publish live website link',
        icon: <ShareIcon size={14} />,
        run: () => show('publish'),
      });
      out.push({
        id: 'export',
        section: 'Actions',
        label: 'Export this Crux',
        keywords: 'download archive backup zip',
        icon: <ExportIcon size={14} />,
        run: () => show('export'),
      });
    }
    out.push({
      id: 'find-navigator',
      section: 'Actions',
      label: 'Find in Navigator',
      keywords: 'search gardens cruxes tree browse',
      icon: <PlusCircleIcon size={14} />,
      run: () => useGardenContext.getState().requestSearch(),
    });
    if (term)
      out.push({
        id: 'explore-search',
        section: 'Actions',
        label: `Search Explore for “${term}”`,
        keywords: `${term} explore community published find`,
        icon: <SearchIcon size={14} />,
        run: () => {
          seedExplore(term);
          show('explore');
        },
      });

    // ── Panels: the same list as the Panels picker, open or closed ──
    for (const pane of offeredPanes(scope, activeCruxId, aiEnabled, advancedMode)) {
      const { icon: Icon, label, prefix, keywords } = PANES[pane];
      const isOpen = !!visibility[pane];
      out.push({
        id: `pane:${pane}`,
        section: 'Panels',
        label: `${isOpen ? 'Hide' : 'Show'} ${labels[pane]}`,
        keywords: `${label} ${keywords ?? ''} panel pane toggle ${isOpen ? 'close' : 'open'}`,
        icon: (
          <span style={{ color: `var(${prefix}-button-icon-active)` }}>
            <Icon size={14} />
          </span>
        ),
        run: () => ui.getState().setPaneVisible(pane, !isOpen),
      });
    }

    // ── Moods: every bundled and saved one, by name ──
    const seen = new Set<string>();
    for (const mood of [...getInstalledMoods(), ...BUNDLED_MOODS]) {
      if (seen.has(mood.id)) continue;
      seen.add(mood.id);
      out.push({
        id: `mood:${mood.id}`,
        section: 'Moods',
        label: `Wear ${mood.name}`,
        keywords: `mood theme look ${mood.theme.section}`,
        icon: <MoodIcon size={14} />,
        queryOnly: true,
        run: async () => {
          await chooseMood(mood);
          toast(`Wearing ${mood.name}`);
        },
      });
    }

    // ── Settings ──
    const dark = themeMode !== ThemeMode.Light;
    out.push({
      id: 'theme',
      section: 'Settings',
      label: dark ? 'Switch to light' : 'Switch to dark',
      keywords: 'theme mode appearance day night',
      icon: dark ? <SunIcon size={14} /> : <MoonIcon size={14} />,
      run: () => useThemeStore.getState().setMode(dark ? ThemeMode.Light : ThemeMode.Dark),
    });
    out.push({
      id: 'settings',
      section: 'Settings',
      label: 'Open Settings',
      hint: shortcutText(shortcut('settings'), isMac),
      keywords: 'preferences account names data',
      icon: <SlidersIcon size={14} />,
      run: () => openSettings(),
    });
    out.push({
      id: 'shortcuts',
      section: 'Settings',
      label: 'Keyboard shortcuts',
      keywords: 'keys hotkeys keybindings accelerators help',
      icon: <SlidersIcon size={14} />,
      run: () => openShellDialog('shortcuts'),
    });
    out.push({
      id: 'report-problem',
      section: 'Settings',
      label: 'Report a problem',
      keywords: 'bug issue feedback crash broken support logs github',
      icon: <ShareIcon size={14} />,
      run: () => openShellDialog('report-problem'),
    });
    out.push({
      id: 'about',
      section: 'Settings',
      label: 'About Crux Garden',
      keywords: 'version licence license open source notices credits',
      icon: <SproutIcon size={14} />,
      run: () => openShellDialog('about'),
    });
    return out;
  }, [
    scope,
    activeCruxId,
    found,
    term,
    entries,
    activeId,
    garden,
    goTo,
    navigate,
    ui,
    visibility,
    aiEnabled,
    advancedMode,
    labels,
    themeMode,
  ]);

  // Sections in a fixed order; within one, the closest matches first.
  const groups = useMemo(() => {
    const scored = commands
      .map((command) => ({ command, score: score(command, term) }))
      .filter((c) => c.score > 0);
    return SECTIONS.map((section) => {
      const items = scored
        .filter((c) => c.command.section === section)
        .sort((a, b) => b.score - a.score)
        .map((c) => c.command);
      const cap = term ? CAP[section] : undefined;
      return { section, items: cap ? items.slice(0, cap) : items };
    }).filter((g) => g.items.length);
  }, [commands, term]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => setActive(0), [term]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const dismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const run = useCallback(
    (command: Command | undefined) => {
      if (!command) return;
      dismiss();
      void Promise.resolve()
        .then(command.run)
        .catch((error: unknown) =>
          toast(error instanceof Error ? error.message : `Could not ${command.label}`, {
            tone: 'error',
          }),
        );
    },
    [dismiss],
  );

  let index = -1;
  return (
    <div data-modal-open="true" className="fixed inset-0 z-[75] flex justify-center px-4">
      <div className="absolute inset-0 modal-scrim" onClick={dismiss} />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette"
        className="overlay-plate relative mt-[12vh] h-fit w-full max-w-xl flex flex-col rounded-dropdown border border-dropdown-border bg-dropdown shadow-modal motion-enter-dropdown overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            dismiss();
            return;
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!flat.length) return;
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((current + step + flat.length) % flat.length);
            return;
          }
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            run(flat[current]);
          }
          if (e.key === 'Tab') e.preventDefault();
        }}
      >
        <div className="flex items-center gap-2.5 px-3.5 border-b border-dropdown-border">
          <SearchIcon size={15} className="text-text-muted shrink-0" />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={flat.length ? `${id}-option-${current}` : undefined}
            aria-autocomplete="list"
            aria-label="Search or run a command"
            placeholder="Go to, open a panel, wear a Mood, run a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 h-12 bg-transparent text-sm text-text placeholder:text-placeholder outline-none"
          />
          <Kbd>esc</Kbd>
        </div>
        <div
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label="Commands"
          className="max-h-[min(60vh,440px)] overflow-y-auto p-1.5"
        >
          {groups.map((group) => (
            <div
              key={group.section}
              role="group"
              aria-labelledby={`${id}-${encodeURIComponent(group.section)}`}
            >
              <div
                id={`${id}-${encodeURIComponent(group.section)}`}
                className="px-2.5 pt-2 pb-1 text-2xs font-medium uppercase tracking-wide text-text-muted"
              >
                {group.section}
              </div>
              {group.items.map((command) => {
                index += 1;
                const mine = index;
                return (
                  <div
                    key={command.id}
                    id={`${id}-option-${mine}`}
                    role="option"
                    aria-selected={mine === current}
                    data-index={mine}
                    data-command={command.id}
                    onMouseMove={() => mine !== current && setActive(mine)}
                    onClick={() => run(command)}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 h-8 rounded-[var(--radius-sm)] text-sm cursor-pointer select-none',
                      'transition-[background-color,color] duration-100',
                      mine === current ? 'bg-action-button-hover text-text' : 'text-text',
                    )}
                  >
                    <span className="w-4 flex justify-center text-text-muted shrink-0">
                      {command.icon}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{command.label}</span>
                    {command.hint && (
                      <span className="shrink-0 max-w-[45%] truncate text-xs text-text-muted">
                        {command.hint}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {!flat.length && (
            <p role="status" className="px-3 py-6 text-center text-sm text-text-muted">
              Nothing matches “{term}”
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 px-3.5 py-2 border-t border-dropdown-border text-2xs text-text-muted">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> choose
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> run
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>{COMMAND_SHORTCUT}</Kbd> anywhere
          </span>
        </div>
      </div>
    </div>
  );
}
