import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useWorkspaceUIStore,
  useWorkspaceUIStoreApi,
  useUIStore,
  DEFAULT_PANE_ORDER,
} from '@/stores/uiStore';
import { usePaneLabels } from '@/hooks/usePaneLabels';
import { PANE_BUTTONS, PANE_VAR_PREFIX } from '@/components/workspace/paneConfig';
import { PlusCircleIcon } from '@/components/ui/icons';
import { arrangeWorkspacePanels } from '@/services/workspace-layouts';

/** Discovery for closed panels. Opening uses the same workspace operation as agents. */
export default function PanelPicker() {
  const ui = useWorkspaceUIStoreApi();
  const activeCruxId = useWorkspaceUIStore((s) => s.activeCruxId);
  const visibility = useWorkspaceUIStore((s) => s.paneVisibility);
  const labels = usePaneLabels();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const [position, setPosition] = useState({ left: 8, top: 48, maxHeight: 400, width: 288 });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(288, innerWidth - 16);
      const top = rect.bottom + 8;
      setPosition({
        left: Math.max(8, Math.min(rect.right - width, innerWidth - width - 8)),
        top,
        width,
        maxHeight: Math.max(80, innerHeight - top - 8),
      });
    };
    place();
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(place);
    observer.observe(root.current!.closest('header')!);
    return () => {
      window.removeEventListener('resize', place);
      observer.disconnect();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !popup.current?.contains(target)) close();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open, close]);
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  const finish = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const available = (activeCruxId ? DEFAULT_PANE_ORDER : [])
    .filter((pane) => !visibility[pane])
    .filter((pane) => {
      const config = PANE_BUTTONS.find((b) => b.type === pane)!;
      return `${labels[pane]} ${config.label}`.toLowerCase().includes(query.trim().toLowerCase());
    });
  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label="Add panel"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="h-7 px-2 inline-flex items-center gap-1 text-xs text-toolbar-text rounded-[var(--radius-sm)] hover:bg-action-button-hover cursor-pointer"
        onClick={() => {
          setQuery('');
          setError('');
          setOpen(!open);
        }}
      >
        <PlusCircleIcon />
        <span>Panels</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            role="dialog"
            aria-label="Add panel"
            data-motion-role="dropdown"
            style={position}
            className="fixed z-50 overflow-y-auto bg-dropdown backdrop-blur-xl text-dropdown-text border border-dropdown-border rounded-dropdown shadow-dropdown p-2"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finish();
              }
              if (
                ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) &&
                !(e.target === search.current && ['Home', 'End'].includes(e.key))
              ) {
                e.preventDefault();
                e.stopPropagation();
                const buttons = [
                  ...popup.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
                ];
                const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const index =
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? buttons.length - 1
                      : ((current < 0 && e.key === 'ArrowUp' ? 0 : current) +
                          (e.key === 'ArrowDown' ? 1 : -1) +
                          buttons.length) %
                        buttons.length;
                buttons[index]?.focus();
              }
            }}
          >
            <input
              ref={search}
              aria-label="Find a panel"
              placeholder="Find a panel…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-2 py-2 mb-1 text-sm bg-input text-input-text border border-input-border rounded-input"
            />
            {[
              ['Mood', () => useUIStore.getState().setMoodPanelOpen(true)],
              ['Explore', () => useUIStore.getState().setExploreOpen(true)],
              ['Settings', () => useUIStore.getState().setSettingsOpen(true)],
              ['Console', () => useUIStore.getState().setConsoleOpen(true)],
            ]
              .filter(([label]) => String(label).toLowerCase().includes(query.toLowerCase()))
              .map(([label, action]) => (
                <button
                  key={String(label)}
                  className="w-full text-left text-sm px-2 py-2 hover:bg-dropdown-item-hover rounded-[var(--radius-sm)] cursor-pointer"
                  onClick={() => {
                    (action as () => void)();
                    finish();
                  }}
                >
                  {String(label)}
                </button>
              ))}
            {available.map((pane) => {
              const config = PANE_BUTTONS.find((b) => b.type === pane)!;
              const Icon = config.icon;
              const prefix = PANE_VAR_PREFIX[pane];
              return (
                <button
                  key={pane}
                  type="button"
                  aria-label={`Toggle ${config.label.toLowerCase()}`}
                  aria-pressed={false}
                  className="w-full flex items-center gap-2 text-left text-sm px-2 py-2 rounded-[var(--radius-sm)] hover:bg-dropdown-item-hover focus:bg-dropdown-item-hover cursor-pointer"
                  onClick={() => {
                    ui.getState().setPaneVisible(pane, true);
                    finish();
                  }}
                >
                  <span style={{ color: `var(${prefix}-button-icon)` }}>
                    <Icon />
                  </span>
                  <span className="min-w-0 truncate">{labels[pane]}</span>
                </button>
              );
            })}
            {!available.length && (
              <p role="status" className="text-xs text-text-muted p-2">
                {query ? 'No matching panels' : 'All panels are open'}
              </p>
            )}
            <div className="border-t border-dropdown-border mt-1 pt-1">
              <button
                type="button"
                disabled={busy}
                className="w-full text-left text-sm px-2 py-2 hover:bg-dropdown-item-hover rounded-[var(--radius-sm)] cursor-pointer disabled:opacity-50"
                onClick={() => {
                  setBusy(true);
                  setError('');
                  void arrangeWorkspacePanels(ui)
                    .then(finish)
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                    .finally(() => setBusy(false));
                }}
              >
                Arrange open panels
              </button>
              <button
                type="button"
                className="w-full text-left text-sm px-2 py-2 hover:bg-dropdown-item-hover rounded-[var(--radius-sm)] cursor-pointer"
                onClick={() => {
                  finish();
                  useUIStore.getState().setSettingsOpen(true);
                }}
              >
                Workspace layouts…
              </button>
            </div>
            {error && (
              <p role="alert" className="text-xs text-error p-2">
                {error}
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
