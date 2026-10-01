import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { createPortal } from 'react-dom';
import {
  useWorkspaceUIStore,
  useWorkspaceUIStoreApi,
  useUIStore,
  type PaneType,
} from '@/stores/uiStore';
import { offeredPanes } from './panel-order';
import { usePaneLabels } from '@/hooks/usePaneLabels';
import { PANES } from '@/components/workspace/paneConfig';
import { LayoutIcon } from '@/components/ui/icons';
import { arrangeWorkspacePanels } from '@/services/workspace-layouts';
import { togglePin, usePinned } from '@/stores/pins';
import { cn } from '@/lib/cn';
import { buttonClass, fieldClass, iconButtonClass, menuItemClass } from '@/components/ui';

/** Panes with their own top-bar control: listed only when closed, never pinned. */
const OWN_BUTTON = new Set<PaneType>(['navigator', 'mood', 'console']);

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
export default function PanelPicker() {
  const aiEnabled = useAiEnabled();
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
  const available = offeredPanes(scope, activeCruxId, aiEnabled)
    .filter((pane) => !OWN_BUTTON.has(pane) || !visibility[pane])
    .filter((pane) => {
      return `${labels[pane]} ${PANES[pane].label} ${PANES[pane].keywords ?? ''}`
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
        className={buttonClass('ghost', 'xs', 'gap-1 px-2 text-toolbar-text')}
        onClick={() => {
          setQuery('');
          setError('');
          setOpen(!open);
        }}
      >
        <LayoutIcon size={15} />
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
            className="fixed z-50 overflow-y-auto bg-dropdown text-text border border-dropdown-border rounded-dropdown shadow-dropdown p-1.5 motion-enter-dropdown"
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
              className={fieldClass(undefined, 'mb-1.5')}
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
                    className={menuItemClass('default', 'flex-1 min-w-0 w-auto')}
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
                      className={iconButtonClass(
                        'sm',
                        false,
                        isPinned
                          ? 'text-accent hover:text-accent'
                          : 'opacity-[var(--secondary-action-opacity)] hover:opacity-100',
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
                className={menuItemClass()}
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
                className={menuItemClass()}
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
