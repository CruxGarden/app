import PendingPackageImports from '@/components/garden/PendingPackageImports';
import FieldGuide from '@/components/explore/FieldGuide';
import CommandPalette from './CommandPalette';
import ShellDialogs from './ShellDialogs';
import SetupAgainHost from '@/components/setup/SetupAgainHost';
import { runMenuCommand, toggleMood, toggleSettings } from './app-commands';
import { claimShortcut, matchesShortcut, shortcut } from '@/lib/shortcuts';
import { openShellDialog } from '@/stores/shellDialogs';
import { toast } from '@/stores/toastStore';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { useCommandPalette } from '@/stores/commandPalette';
import { gardenPath, useGardenContext } from '@/stores/gardenContext';
import {
  resolveWorkspaceDestination,
  type WorkspaceDestination,
} from '@/services/garden-navigation';
import TendingNotifications from '@/components/tending/TendingNotifications';
import { startTendingCatalog } from '@/stores/tendingStore';
import WorkspaceLifecycle from './WorkspaceLifecycle';
import { restoreWorkspaceList } from '@/stores/workspaceRegistry';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import TopBar from './TopBar';
import { DialogHost, Panel, buttonClass, rowClass } from '@/components/ui';
import { currentWorkspaceUI, useUIStore } from '@/stores/uiStore';
import { startNavigatorPane } from '@/services/navigator-pane';
import { useAppStore } from '@/stores/appStore';
import { dismissSplash } from '@/lib/splash';
import { startSignals } from '@/lib/moods/signals';
import { Capability, can } from '@/lib/platform';

import MoodTextureLayers from './MoodTextureLayers';
import { MotionConfig } from 'motion/react';

export default function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  // Read at redirect time, not a reason to re-run the resolver.
  const locationState = useRef(location.state);
  locationState.current = location.state;
  const [servicesReady, setServicesReady] = useState(useAppStore.getState().ready);
  const [initError, setInitError] = useState<string | null>(null);
  const aiEnabled = useUIStore((s) => s.aiEnabled);
  const rootGarden = useGardenContext((s) => s.root);
  const gardenId = new URLSearchParams(location.search).get('garden') ?? rootGarden?.id;
  const routeCruxId = /^\/c\/([^/]+)$/.exec(location.pathname)?.[1] ?? null;
  const revision = useGardenContext((s) => s.revision);
  // Only the resolved Garden/Crux pair unlocks its content. Task/Growth query
  // changes do not tear down an already resolved workspace.
  const requestKey = `${location.pathname}:${gardenId ?? ''}`;
  const [destination, setDestination] = useState<{
    key: string;
    value?: WorkspaceDestination;
    error?: string;
  } | null>(null);
  const [locationRetry, setLocationRetry] = useState(0);
  const resolved = destination?.key === requestKey ? destination : null;
  const locationPath = (id: string) => {
    const query = new URLSearchParams(location.search);
    query.set('garden', id);
    return `${location.pathname}?${query}${location.hash}`;
  };
  useEffect(() => {
    if (!servicesReady || (!gardenId && !routeCruxId)) return;
    let cancelled = false;
    void resolveWorkspaceDestination(gardenId, routeCruxId)
      .then((value) => {
        if (cancelled) return;
        if (value.status === 'ready') {
          const query = new URLSearchParams(location.search);
          const enterGarden = !!routeCruxId && value.cruxId === null;
          if (query.get('garden') !== value.garden.id || enterGarden) {
            query.set('garden', value.garden.id);
            if (enterGarden) {
              query.delete('task');
              query.delete('growth');
            }
            // Canonicalize the new entry, preserving the location we came from.
            // `state` rides along: a Tending "Answer" says which pane to reveal.
            void navigate(`${enterGarden ? '/home' : location.pathname}?${query}${location.hash}`, {
              replace: true,
              state: locationState.current,
            });
            return;
          }
          useGardenContext.getState().select(value.garden);
        }
        setDestination({ key: requestKey, value });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setDestination({
            key: requestKey,
            error: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [
    servicesReady,
    gardenId,
    routeCruxId,
    requestKey,
    revision,
    location.pathname,
    location.search,
    location.hash,
    locationRetry,
    navigate,
  ]);
  // The Navigator is a pane that follows you from workspace to workspace.
  useEffect(() => startNavigatorPane(), []);

  useEffect(() => {
    if (!servicesReady) return;
    void restoreWorkspaceList().catch(console.error);
  }, [servicesReady, navigate]);

  useEffect(() => {
    if (servicesReady) return startTendingCatalog();
  }, [servicesReady]);

  // Reactive theme signals (--signal-audio/typing/agent) live for the app's lifetime
  useEffect(() => startSignals(), []);

  // Frameless-window chrome, as an attribute the stylesheets can read. Only
  // there do the traffic lights exist, and only there does anything need to
  // leave room for them — the Plasma dock does.
  useEffect(() => {
    document.documentElement.dataset.desktopChrome = can(Capability.DesktopChrome)
      ? 'true'
      : 'false';
  }, []);

  useEffect(() => {
    if (servicesReady) return;
    useAppStore
      .getState()
      .bootstrap()
      .then(() => {
        dismissSplash();
        setServicesReady(true);
      })
      .catch((err: unknown) => {
        // The old fallback had no catch: a failed init left the TopBar over an
        // empty <main> with no message, forever.
        console.error('[shell] bootstrap failed:', err);
        dismissSplash();
        setInitError(err instanceof Error ? err.message : 'Could not start Crux Garden.');
      });
  }, [servicesReady]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // A modal or an editable control that already handled this key owns it.
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const editing =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

      // Escape → open console (when AI enabled, console not open, not typing,
      // and no dialog, menu or picker is open: that Escape is theirs).
      if (
        e.key === 'Escape' &&
        aiEnabled &&
        !editing &&
        !currentWorkspaceUI().getState().paneVisibility.console &&
        !document.querySelector(
          '[data-modal-open], [aria-modal="true"], [aria-haspopup][aria-expanded="true"]',
        )
      ) {
        currentWorkspaceUI().getState().setPaneVisible('console', true);
        return;
      }

      // Cmd+M → toggle the Mood pane. The desktop menu carries the same keys
      // (so they work while an embedded frame has the keyboard); one press, one toggle.
      if (matchesShortcut(shortcut('mood'), e)) {
        e.preventDefault();
        if (claimShortcut('mood', 'key')) toggleMood();
        return;
      }

      // Cmd+, → toggle settings
      if (matchesShortcut(shortcut('settings'), e)) {
        e.preventDefault();
        if (claimShortcut('settings', 'key')) toggleSettings();
        return;
      }
    };
    // Cmd/Ctrl+K: the command palette — go anywhere, any panel, any command.
    // Heard before anything else, so an editor with its own Cmd+K chords
    // (Monaco) does not swallow it; pressed again, it puts the palette away.
    const palette = (e?: KeyboardEvent) => {
      const state = useCommandPalette.getState();
      if (state.open) {
        e?.preventDefault();
        e?.stopPropagation();
        state.close();
        return;
      }
      // A dialog already has the keyboard.
      if (document.querySelector('[data-modal-open="true"], [aria-modal="true"]')) return;
      e?.preventDefault();
      e?.stopPropagation();
      state.openPalette();
    };
    const capture = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.isComposing) return;
      if (e.key.toLowerCase() === 'k') palette(e);
    };
    window.addEventListener('keydown', capture, true);
    window.addEventListener('keydown', handler);
    // The desktop shell hears Cmd/Ctrl+K even while an embedded frame has the keyboard.
    const offCommand = window.electronAPI?.desktop.onWorkspaceCommand?.((command) => {
      if (command === 'navigate') palette();
    });
    return () => {
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('keydown', handler);
      offCommand?.();
    };
  }, [aiEnabled]);

  // The desktop application menu: each item names a command; the same
  // functions the command palette runs answer it. One listener for the app.
  const moodNavigate = useMoodNavigate();
  const menuNavigate = useRef(moodNavigate);
  menuNavigate.current = moodNavigate;
  useEffect(() => {
    if (!servicesReady) return;
    return window.electronAPI?.desktop.onMenuCommand?.((command, viaAccelerator) =>
      runMenuCommand(command, viaAccelerator, (to) => void menuNavigate.current(to)),
    );
  }, [servicesReady]);

  // The last session crashed or was killed: say so once, quietly, and offer
  // the report dialog. Nothing is sent (ADR 0008).
  useEffect(() => {
    if (!servicesReady) return;
    void window.electronAPI?.desktop
      .previousCrash?.()
      .then((crash) => {
        if (!crash) return;
        toast("Crux Garden didn't close properly last time.", {
          duration: 15000,
          action: { label: 'Report a problem', run: () => openShellDialog('report-problem') },
        });
      })
      .catch(() => undefined);
  }, [servicesReady]);

  return (
    // Motion never applies its own reduced-motion rule: the person's motion intensity (ADR 0041)
    // already maps prefers-reduced-motion to instant through the tokens every role reads.
    <MotionConfig reducedMotion="never">
      <div className="flex flex-col h-screen overflow-hidden">
        <WorkspaceLifecycle />
        {servicesReady && <CommandPalette />}
        {servicesReady && <FieldGuide />}
        {servicesReady && <ShellDialogs />}
        {servicesReady && <SetupAgainHost />}
        {servicesReady && <TendingNotifications />}
        <MoodTextureLayers />
        {/* Top bar */}
        <div className="plasma-drag-strip relative z-20 shrink-0">
          <TopBar />
        </div>

        {/* Main */}
        <div className="flex flex-1 min-h-0 overflow-x-auto">
          <main className="relative flex-1 min-w-0 min-h-0 overflow-y-auto">
            {initError || resolved?.error ? (
              <div role="alert" className="flex h-full items-center justify-center p-8 text-center">
                <Panel padding="lg" className="max-w-sm w-full flex flex-col items-center gap-3">
                  <h2 className="font-display text-base text-text">
                    {initError ? "Crux Garden couldn't start" : 'Could not open this location'}
                  </h2>
                  <p className="text-sm text-text-muted">{initError || resolved?.error}</p>
                  {!initError && (
                    <button
                      className={buttonClass('secondary', 'sm')}
                      onClick={() => setLocationRetry((n) => n + 1)}
                    >
                      Retry location
                    </button>
                  )}
                  {rootGarden && (
                    <button
                      className={buttonClass('ghost', 'sm')}
                      onClick={() => void navigate(gardenPath(rootGarden.id))}
                    >
                      Open {rootGarden.title || 'My Garden'}
                    </button>
                  )}
                </Panel>
              </div>
            ) : resolved?.value?.status === 'choose' ? (
              <Panel
                as="section"
                padding="lg"
                className="m-8 max-w-md mx-auto"
                aria-label="Choose Garden"
              >
                <h1 className="text-base font-display mb-2">Choose a Garden</h1>
                <p className="text-sm text-text-muted mb-4">
                  This Crux is in more than one Garden.
                </p>
                {resolved.value.choices.map((choice) => (
                  <button
                    key={choice.id}
                    disabled={!choice.available}
                    className={rowClass(false, 'block disabled:cursor-not-allowed')}
                    onClick={() => {
                      void navigate(locationPath(choice.id), { replace: true });
                    }}
                  >
                    {choice.title || 'Untitled Garden'}
                    {!choice.available && ' · Unavailable'}
                  </button>
                ))}
              </Panel>
            ) : resolved?.value?.status === 'unplaced' ? (
              <Panel
                as="section"
                padding="lg"
                className="m-8 max-w-md mx-auto"
                aria-label="Unplaced Crux"
              >
                <h1 className="text-base font-display mb-2">This Crux isn’t in a Garden yet</h1>
                <p className="text-sm text-text-muted mb-4">
                  Open a Garden and choose Add existing Crux to place it. Its content is still here.
                </p>
                {rootGarden && (
                  <button
                    className={buttonClass('secondary', 'sm')}
                    onClick={() => {
                      void navigate(gardenPath(rootGarden.id));
                    }}
                  >
                    Open {rootGarden.title || 'My Garden'}
                  </button>
                )}
              </Panel>
            ) : servicesReady && resolved?.value?.status === 'ready' ? (
              <Outlet />
            ) : (
              <p role="status" className="p-8 text-sm text-text-muted">
                Opening location…
              </p>
            )}
          </main>
        </div>

        {/* App confirm/alert dialogs (replaces window.confirm/alert) */}
        <DialogHost />
        <PendingPackageImports />
      </div>
    </MotionConfig>
  );
}
