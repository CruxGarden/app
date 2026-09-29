import { useAiEnabled } from '@/hooks/useAiEnabled';
import { tendingPath } from '@/services/tending-actions';
import { copyIdentity } from '@/services/working-copies';
import { documentsFor } from '@/services/workspace-documents';
import { getWorkspace } from '@/stores/workspaceRegistry';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { useWorkspaceRegistry, openWorkspace, closeWorkspace } from '@/stores/workspaceRegistry';
import { useDialogStore } from '@/stores/dialogStore';
import { getServices } from '@/services';
import { ChevronDownIcon, CloseIcon, FolderIcon } from '@/components/ui/icons';
import {
  Button,
  Input,
  buttonClass,
  fieldClass,
  iconButtonClass,
  menuItemClass,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { recentOrder, nextRecent } from '@/lib/workspace-switching';
import { useGardenContext } from '@/stores/gardenContext';
import { gardenMembers, opensAsWorkspace } from '@/services/garden-navigation';

const focusByCrux = new Map<string, { selector: string; start?: number; end?: number }>();
function rememberFocus(id: string | null, target = document.activeElement) {
  if (!id) return;
  const el = target as HTMLInputElement | null;
  if (!el?.closest('[data-workspace-id]')) return;
  const selector = el.closest('.monaco-editor')
    ? '.monaco-editor textarea'
    : el.tagName === 'IFRAME'
      ? 'iframe'
      : el.getAttribute('placeholder')
        ? `[placeholder=${JSON.stringify(el.getAttribute('placeholder'))}]`
        : '[data-workspace-heading]';
  focusByCrux.set(id, {
    selector,
    start: el.selectionStart ?? undefined,
    end: el.selectionEnd ?? undefined,
  });
}
let focusGeneration = 0;
function restoreFocus(id: string) {
  const generation = ++focusGeneration;
  const initialFocus = document.activeElement;
  const saved = focusByCrux.get(id);
  let frames = 0;
  const restore = () => {
    if (generation !== focusGeneration) return;
    // Navigation may leave focus on body while the destination mounts. A new
    // focused control means the person has moved on; do not steal it back.
    const currentFocus = document.activeElement;
    if (currentFocus && currentFocus !== document.body && currentFocus !== initialFocus) return;
    if (useWorkspaceRegistry.getState().activeId !== id) {
      if (++frames < 120) requestAnimationFrame(restore);
      return;
    }
    if (saved?.selector === '.monaco-editor textarea') {
      const w = getWorkspace(id);
      const tab = w?.ui.getState().editor.activeTabId;
      const focus = w && tab ? documentsFor(w.data, w.ui).get(tab).getState().focus : null;
      if (focus) {
        focus();
        return;
      }
      if (++frames < 120) requestAnimationFrame(restore);
      return;
    }
    const root = document.querySelector(`[data-workspace-id="${id}"]`);
    // Under Plasma a pane's contents mount after its surface forms, so the
    // composer can be a few hundred milliseconds away: keep looking for what
    // was wanted before settling for the workspace heading.
    const wanted = root?.querySelector<HTMLElement>(
      saved?.selector ?? 'textarea[placeholder="Send a message..."]',
    );
    if (!wanted && ++frames < 240) {
      requestAnimationFrame(restore);
      return;
    }
    const el = wanted ?? root?.querySelector<HTMLElement>('[data-workspace-heading]');
    if (!el) return;
    el.focus();
    if (
      saved?.start !== undefined &&
      el instanceof HTMLTextAreaElement &&
      !el.closest('.monaco-editor')
    )
      el.setSelectionRange(saved.start, saved.end ?? saved.start);
  };
  requestAnimationFrame(restore);
}
export default function WorkspaceSwitcher() {
  const { entries, activeId } = useWorkspaceRegistry();
  const navigate = useMoodNavigate();
  const aiEnabled = useAiEnabled();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picker, setPicker] = useState(false);
  const [available, setAvailable] = useState<{ id: string; title: string; slug: string }[]>([]);
  // Display the active Garden only; other workspaces keep running in the registry.
  const garden = useGardenContext((s) => s.garden);
  const gardenId = garden?.id;
  const revision = useGardenContext((s) => s.revision);
  const space = garden ? { name: garden.title } : null;
  const [members, setMembers] = useState<{ id: string; title: string; slug: string }[]>([]);
  const [index, setIndex] = useState(0);
  const [recent, setRecent] = useState<{ ids: string[]; index: number } | null>(null);
  const recentRef = useRef(recent);
  recentRef.current = recent;
  const [closing, setClosing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const invoking = useRef<HTMLElement | null>(null);
  const scopedEntries = garden
    ? entries.filter((entry) => members.some((member) => member.id === (entry.cruxId ?? entry.id)))
    : entries;
  const active = entries.find((e) => e.id === activeId);
  useEffect(() => {
    let cancelled = false;
    setMembers([]);
    if (gardenId)
      void gardenMembers(gardenId)
        .then((rows) => {
          if (!cancelled)
            setMembers(
              rows
                .filter((row) => row.kind !== 'garden' && opensAsWorkspace(row))
                .map((row) => ({ id: row.id, slug: row.slug, title: row.title || 'Untitled' })),
            );
        })
        .catch((err) => {
          if (!cancelled) setError((err as Error).message);
        });
    return () => {
      cancelled = true;
    };
  }, [gardenId, revision]);
  const modal = open || !!closing || !!renaming;
  const rows = (
    picker
      ? available
      : [...scopedEntries, ...members.filter((m) => !scopedEntries.some((e) => e.id === m.id))]
  ).filter((e) =>
    `${e.title} ${'slug' in e ? e.slug : ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    const remember = (event: FocusEvent) =>
      rememberFocus(useWorkspaceRegistry.getState().activeId, event.target as Element);
    document.addEventListener('focusout', remember);
    return () => document.removeEventListener('focusout', remember);
  }, []);
  const cancel = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setRecent(null);
    recentRef.current = null;
    setClosing(null);
    setRenaming(null);
    setError('');
    requestAnimationFrame(() =>
      (invoking.current?.isConnected ? invoking.current : trigger.current)?.focus(),
    );
  }, [busy]);
  const choose = useCallback(
    (id: string) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry && !members.some((m) => m.id === id) && !picker) {
        cancel();
        return;
      }
      rememberFocus(useWorkspaceRegistry.getState().activeId);
      setOpen(false);
      setRecent(null);
      recentRef.current = null;
      navigate(tendingPath({ cruxId: entry?.cruxId ?? id, copyId: id }));
      restoreFocus(id);
    },
    [entries, members, navigate, picker, cancel],
  );
  const beginSearch = useCallback(() => {
    // A restore still waiting on the last switch must not take focus from the search.
    focusGeneration++;
    invoking.current = document.activeElement as HTMLElement;
    rememberFocus(useWorkspaceRegistry.getState().activeId);
    setPicker(false);
    setQuery('');
    setIndex(0);
    setOpen(true);
  }, []);
  useEffect(() => {
    if (closing || renaming) dialog.current?.querySelector<HTMLElement>('input, button')?.focus();
    else if (open) search.current?.focus();
  }, [open, closing, renaming]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || e.getModifierState('AltGraph')) return;
      const otherModal =
        useDialogStore.getState().queue.length > 0 ||
        !!document.querySelector('[aria-label="Close Crux Garden"], [data-modal-open="true"]');
      if (otherModal || closing || renaming) {
        // Reserve these chords even while another dialog owns input; otherwise
        // Keep Shell's Navigator shortcut from acting behind this dialog.
        if (
          ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'k') ||
          (e.ctrlKey && e.key === 'Tab')
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopImmediatePropagation();
        beginSearch();
        return;
      }
      if (e.ctrlKey && e.key === 'Tab' && !open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const current = recentRef.current;
        const state = useWorkspaceRegistry.getState();
        const ids =
          current?.ids ??
          recentOrder(
            scopedEntries.map((x) => x.id),
            state.mru,
          );
        if (!ids.length) return;
        if (!current) {
          invoking.current = document.activeElement as HTMLElement;
          rememberFocus(state.activeId);
          // Move input back to the app so modifier release is delivered even
          // when the chord began inside a cross-origin preview frame.
          window.focus();
          trigger.current?.focus();
        }
        const next = {
          ids,
          index: nextRecent(
            current?.index ?? (state.activeId ? 0 : -1),
            e.shiftKey ? -1 : 1,
            ids.length,
          ),
        };
        recentRef.current = next;
        setRecent(next);
        return;
      }
      if (e.key === 'Escape' && (open || recentRef.current)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancel();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Control' && recentRef.current) {
        const r = recentRef.current;
        choose(r.ids[r.index]!);
      }
    };
    const blur = () => {
      if (recentRef.current && !document.hasFocus()) cancel();
    };
    const offCommand = window.electronAPI?.desktop.onWorkspaceCommand?.((command) => {
      if (command === 'navigate') return;
      const event =
        command === 'search'
          ? new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, altKey: true })
          : command === 'commit'
            ? new KeyboardEvent('keyup', { key: 'Control' })
            : command === 'cancel'
              ? new KeyboardEvent('keydown', { key: 'Escape' })
              : new KeyboardEvent('keydown', {
                  key: 'Tab',
                  ctrlKey: true,
                  shiftKey: command === 'previous',
                });
      if (command === 'commit') up(event);
      else key(event);
    });
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      offCommand?.();
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }, [beginSearch, cancel, choose, closing, renaming, open, scopedEntries]);
  const close = async (documents: 'save' | 'discard') => {
    if (!closing || busy) return;
    setBusy(true);
    setError('');
    try {
      await closeWorkspace(closing, { stop: true, documents });
      const state = useWorkspaceRegistry.getState();
      if (closing === activeId) {
        const next = state.mru.find((id) => scopedEntries.some((entry) => entry.id === id));
        const entry = state.entries.find((e) => e.id === next);
        navigate(next ? tendingPath({ cruxId: entry?.cruxId ?? next, copyId: next }) : '/home');
        if (next) restoreFocus(next);
      }
      setClosing(null);
      setOpen(false);
      if (closing !== activeId) requestAnimationFrame(() => trigger.current?.focus());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {active ? `Workspace: ${active.title}` : 'Garden'}
      </span>
      <button
        ref={trigger}
        type="button"
        aria-label="Switch Crux workspace"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+Alt+K Meta+Alt+K Control+Tab"
        aria-expanded={open}
        title="Switch Crux · Cmd/Ctrl+Alt+K · Ctrl+Tab for recent Cruxes"
        className={buttonClass(
          'ghost',
          'xs',
          'max-w-64 min-w-0 gap-1 px-2 text-sm font-display text-toolbar-text hover:text-toolbar-text',
        )}
        onClick={beginSearch}
      >
        <span
          className="truncate"
          style={active ? { viewTransitionName: `crux-${active.id}` } : undefined}
        >
          {active?.title ?? <FolderIcon />}
        </span>
        {active ? <ChevronDownIcon /> : null}
        {scopedEntries.some(
          (e) => e.id !== activeId && /approval|merge|Failed|Done/.test(e.status),
        ) ? (
          <span
            aria-label="Another Crux needs you"
            className="w-1.5 h-1.5 rounded-full bg-accent motion-attention"
          />
        ) : null}
      </button>
      {recent &&
        createPortal(
          <div
            role="status"
            aria-label="Recent Cruxes"
            className="overlay-plate fixed z-[100] top-20 left-1/2 -translate-x-1/2 min-w-64 rounded-dropdown border border-dropdown-border p-2 shadow-modal motion-enter-dropdown"
          >
            {recent.ids.map((id, i) => (
              <div
                key={id}
                aria-current={i === recent.index ? 'true' : undefined}
                className={cn(
                  'px-2.5 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors',
                  i === recent.index ? 'bg-accent-muted text-text' : 'text-text-muted',
                )}
              >
                {entries.find((e) => e.id === id)?.title ?? 'Closed Crux'}
              </div>
            ))}
            <p className="text-xs text-text-muted mt-1.5 px-2.5">
              Release Control to switch · Escape to cancel
            </p>
          </div>,
          document.body,
        )}
      {modal &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-start justify-center pt-20 modal-scrim"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) cancel();
            }}
          >
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-label={
                closing
                  ? 'Close workspace'
                  : renaming
                    ? copyIdentity(getWorkspace(renaming)?.data.getState().crux)
                      ? 'Rename task'
                      : 'Rename Crux'
                    : 'Switch Crux workspace'
              }
              className="overlay-plate text-text border border-dropdown-border rounded-dropdown p-2 w-[min(30rem,calc(100vw-2rem))] shadow-modal motion-enter-dropdown"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  cancel();
                }
                if (e.key === 'Tab') {
                  const all = [
                    ...dialog.current!.querySelectorAll<HTMLElement>(
                      'button:not(:disabled), input:not(:disabled)',
                    ),
                  ];
                  const i = all.indexOf(document.activeElement as HTMLElement);
                  if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === all.length - 1)) {
                    e.preventDefault();
                    all[e.shiftKey ? all.length - 1 : 0]?.focus();
                  }
                }
              }}
            >
              {closing ? (
                <>
                  <h2
                    className="px-2 pt-1 text-sm font-medium text-text"
                    style={{ fontFamily: 'var(--dialog-title-font)' }}
                  >
                    Close {entries.find((e) => e.id === closing)?.title}?
                  </h2>
                  <p className="px-2 text-xs text-text-muted my-3">
                    Running work will stop.{' '}
                    {aiEnabled ? 'Queued prompts and Growth remain' : 'Growth remains'} available
                    when you reopen. Save or discard unsaved Artifact edits before closing.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" size="sm" disabled={busy} onClick={cancel}>
                      Cancel
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void close('discard')}
                    >
                      Discard edits and close
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => void close('save')}>
                      Save and close
                    </Button>
                  </div>
                </>
              ) : renaming ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      const w = await openWorkspace(renaming);
                      await w.data.getState().updateCrux({ title: title.trim() || 'Untitled' });
                      setRenaming(null);
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label className="flex flex-col gap-1 p-1 text-xs text-text-muted">
                    {copyIdentity(getWorkspace(renaming)?.data.getState().crux)
                      ? 'Task name'
                      : 'Crux title'}
                    <Input
                      autoFocus
                      aria-label={
                        copyIdentity(getWorkspace(renaming)?.data.getState().crux)
                          ? 'Task name'
                          : 'Crux title'
                      }
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <div className="flex justify-end gap-2 mt-3">
                    <Button type="button" variant="ghost" size="sm" onClick={cancel}>
                      Cancel
                    </Button>
                    <Button disabled={busy} type="submit" size="sm">
                      Rename
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <input
                    ref={search}
                    aria-label={
                      picker
                        ? 'Find a Crux in your garden'
                        : space
                          ? `Find a Crux in ${space.name}`
                          : 'Find an open Crux'
                    }
                    placeholder={
                      picker
                        ? 'Find a Crux in your garden…'
                        : space
                          ? `Find a Crux in ${space.name}…`
                          : 'Find an open Crux…'
                    }
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setIndex(0);
                    }}
                    className={fieldClass(undefined, 'mb-1.5')}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        setIndex((i) => nextRecent(i, e.key === 'ArrowDown' ? 1 : -1, rows.length));
                      }
                      if (e.key === 'Enter' && rows[index]) {
                        e.preventDefault();
                        choose(rows[index].id);
                      }
                    }}
                  />
                  <div
                    className="max-h-[50vh] overflow-auto"
                    aria-label={picker ? 'Garden Cruxes' : 'Open Cruxes'}
                  >
                    {rows.map((row, i) => (
                      <div
                        key={row.id}
                        className={cn(
                          'group flex items-center gap-1 pr-1 rounded-[var(--radius-sm)] transition-colors',
                          i === index ? 'bg-accent-muted' : 'hover:bg-action-button-hover',
                        )}
                      >
                        <button
                          className="flex-1 text-left px-2.5 py-1.5 min-w-0 rounded-[var(--radius-sm)] cursor-pointer"
                          aria-current={row.id === activeId ? 'page' : undefined}
                          onClick={() => choose(row.id)}
                        >
                          <span className="block truncate text-sm">
                            {row.id === activeId ? <span className="text-accent">✓ </span> : ''}
                            {row.title}
                          </span>
                          <span className="text-xs text-text-muted">
                            {'status' in row
                              ? row.status
                              : !picker && space
                                ? `In ${space.name} · not open`
                                : row.slug}
                            {'dirty' in row && row.dirty ? ' · Unsaved edits' : ''}
                            {rows.filter((r) => r.title === row.title).length > 1
                              ? ` · ${row.id.slice(0, 8)}`
                              : ''}
                          </span>
                        </button>
                        {entries.some((e) => e.id === row.id) && (
                          <button
                            aria-label={`Close ${row.title} workspace`}
                            className={iconButtonClass(
                              'sm',
                              false,
                              i !== index && 'reveal-on-hover',
                            )}
                            onClick={() => {
                              setClosing(row.id);
                              setError('');
                            }}
                          >
                            <CloseIcon size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!rows.length && (
                    <p role="status" className="px-2.5 py-4 text-sm text-text-muted">
                      No matching Cruxes.
                    </p>
                  )}
                  <div className="border-t border-dropdown-border mt-1.5 pt-1.5 flex flex-col">
                    <button
                      className={menuItemClass()}
                      onClick={async () => {
                        try {
                          const cruxes = garden
                            ? await gardenMembers(garden.id)
                            : await getServices().crux.listAll();
                          setAvailable(
                            cruxes
                              .filter(
                                (c) =>
                                  c.kind !== 'snapshot' &&
                                  c.kind !== 'garden' &&
                                  opensAsWorkspace(c),
                              )
                              .map((c) => ({
                                id: c.id,
                                title: c.title || 'Untitled',
                                slug: c.slug,
                              })),
                          );
                          setPicker(true);
                          setQuery('');
                          setIndex(0);
                          search.current?.focus();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Open another Crux…
                    </button>
                    {active && (
                      <>
                        <button
                          className={menuItemClass()}
                          onClick={() => {
                            setRenaming(active.id);
                            setTitle(
                              copyIdentity(getWorkspace(active.id)?.data.getState().crux)?.title ??
                                active.title,
                            );
                          }}
                        >
                          Rename current Crux…
                        </button>
                        <button className={menuItemClass()} onClick={() => setClosing(active.id)}>
                          Close current workspace
                        </button>
                      </>
                    )}
                    <button
                      className={menuItemClass('default', 'text-text-muted')}
                      onClick={cancel}
                    >
                      Cancel
                    </button>
                    <span className="px-2.5 pt-1.5 pb-0.5 text-xs text-text-muted">
                      Ctrl+Tab: recent Cruxes · ↑↓: select · Enter: open
                    </span>
                  </div>
                </>
              )}
              {error && (
                <p role="alert" className="px-2 text-error text-xs mt-3">
                  {error}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
