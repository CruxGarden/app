import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useWorkspaceUIStore,
  useWorkspaceUIStoreApi,
  useUIStore,
  DEFAULT_PANE_ORDER,
  GARDEN_PANE_ORDER,
  type PaneType,
} from '@/stores/uiStore';
import { usePaneLabels } from '@/hooks/usePaneLabels';
import { PANES } from '@/components/workspace/paneConfig';
import { PlusCircleIcon } from '@/components/ui/icons';
import { arrangeWorkspacePanels } from '@/services/workspace-layouts';
import { togglePin, usePinned } from '@/stores/pins';
import { cn } from '@/lib/cn';

/** Panes with their own top-bar button: listed only when closed, never pinned. */
const OWN_BUTTON = new Set<PaneType>(['navigator', 'explore', 'mood', 'console']);

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 17v5" />
      <path d="M9 10.76V6h6v4.76a2 2 0 0 0 .6 1.43L18 14.6V16H6v-1.4l2.4-2.41a2 2 0 0 0 .6-1.43Z" />
      <path d="M8 2h8" />
    </svg>
  );
}

/** Discovery for closed panels. Opening uses the same workspace operation as agents. */
const GARDEN_WIDE = new Set<PaneType>([
  'navigator',
  'console',
  'tending',
  'mood',
  'synth',
  'browser',
  'settings',
  'explore',
]);

export default function PanelPicker() {
  const ui = useWorkspaceUIStoreApi();
  const activeCruxId = useWorkspaceUIStore((s) => s.activeCruxId);
  const scope = useWorkspaceUIStore((s) => s.workspaceScope);
  const visibility = useWorkspaceUIStore((s) => s.paneVisibility);
  const labels = usePaneLabels();
  const pinned = usePinned(scope);
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
  // This workspace's own panes first, then the Garden-wide ones.
  const available = (
    scope === 'garden'
      ? GARDEN_PANE_ORDER
      : activeCruxId
        ? [
            ...DEFAULT_PANE_ORDER.filter((p) => !GARDEN_WIDE.has(p)),
            ...DEFAULT_PANE_ORDER.filter((p) => GARDEN_WIDE.has(p)),
          ]
        : []
  )
    .filter((pane) => !OWN_BUTTON.has(pane) || !visibility[pane])
    .filter((pane) => {
      return `${labels[pane]} ${PANES[pane].label}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
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
            {available.map((pane) => {
              const { icon: Icon, label, prefix } = PANES[pane];
              const isOpen = !!visibility[pane];
              const isPinned = pinned.includes(pane);
              return (
                <div key={pane} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Toggle ${label.toLowerCase()}`}
                    aria-pressed={isOpen}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left text-sm px-2 py-2 rounded-[var(--radius-sm)] hover:bg-dropdown-item-hover focus:bg-dropdown-item-hover cursor-pointer"
                    onClick={() => {
                      ui.getState().setPaneVisible(pane, !isOpen);
                      if (!isOpen) finish();
                    }}
                  >
                    <span
                      style={{
                        color: isOpen
                          ? `var(${prefix}-button-icon-active)`
                          : `var(${prefix}-button-icon)`,
                      }}
                    >
                      <Icon />
                    </span>
                    <span className={cn('min-w-0 truncate', !isOpen && 'text-text-muted')}>
                      {labels[pane]}
                    </span>
                  </button>
                  {!OWN_BUTTON.has(pane) && (
                    <button
                      type="button"
                      aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${labels[pane]}`}
                      aria-pressed={isPinned}
                      title={isPinned ? 'Unpin from the bar' : 'Keep in the bar'}
                      className={cn(
                        'shrink-0 w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-dropdown-item-hover cursor-pointer',
                        isPinned ? 'text-accent' : 'text-text-muted opacity-60 hover:opacity-100',
                      )}
                      onClick={() => togglePin(scope, pane)}
                    >
                      <PinIcon filled={isPinned} />
                    </button>
                  )}
                </div>
              );
            })}
            {!available.length && (
              <p role="status" className="text-xs text-text-muted p-2">
                No matching panels
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
