import { copyIdentity } from '@/services/working-copies';
import { documentsFor } from '@/services/workspace-documents';
import { getWorkspace } from '@/stores/workspaceRegistry';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceRegistry, openWorkspace, closeWorkspace } from '@/stores/workspaceRegistry';
import { useUIStore } from '@/stores/uiStore';
import { useDialogStore } from '@/stores/dialogStore';
import { getServices } from '@/services';
import { recentOrder, nextRecent } from '@/lib/workspace-switching';

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
  const saved = focusByCrux.get(id);
  let frames = 0;
  const restore = () => {
    if (generation !== focusGeneration) return;
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
    const el =
      root?.querySelector<HTMLElement>(
        saved?.selector ?? 'textarea[placeholder="Send a message..."]',
      ) ?? root?.querySelector<HTMLElement>('[data-workspace-heading]');
    if (!el) {
      if (++frames < 120) requestAnimationFrame(restore);
      return;
    }
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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picker, setPicker] = useState(false);
  const [available, setAvailable] = useState<{ id: string; title: string; slug: string }[]>([]);
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
  const active = entries.find((e) => e.id === activeId);
  const modal = open || !!closing || !!renaming;
  const rows = (picker ? available : entries).filter((e) =>
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
      if (!entries.some((e) => e.id === id) && !picker) {
        cancel();
        return;
      }
      rememberFocus(useWorkspaceRegistry.getState().activeId);
      setOpen(false);
      setRecent(null);
      recentRef.current = null;
      navigate(`/c/${id}`);
      restoreFocus(id);
    },
    [entries, navigate, picker, cancel],
  );
  const beginSearch = useCallback(() => {
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
      const global = useUIStore.getState();
      const otherModal =
        global.settingsOpen ||
        global.moodPanelOpen ||
        global.exploreOpen ||
        global.consoleOpen ||
        useDialogStore.getState().queue.length > 0 ||
        !!document.querySelector('[aria-label="Close Crux Garden"], [data-modal-open="true"]');
      if (otherModal || closing || renaming) {
        // Reserve these chords even while another dialog owns input; otherwise
        // Shell's broader Cmd/Ctrl+K handler opens Explore behind that dialog.
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
            state.entries.map((x) => x.id),
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
  }, [beginSearch, cancel, choose, closing, renaming, open]);
  const close = async (documents: 'save' | 'discard') => {
    if (!closing || busy) return;
    setBusy(true);
    setError('');
    try {
      await closeWorkspace(closing, { stop: true, documents });
      const state = useWorkspaceRegistry.getState();
      if (closing === activeId) {
        const next = state.mru[0];
        navigate(next ? `/c/${next}` : '/home');
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
        className="text-xs font-display text-toolbar-text truncate max-w-64 cursor-pointer focus-visible:outline-2 focus-visible:outline-accent"
        onClick={beginSearch}
      >
        {active?.title ?? 'Open Cruxes'} ▾{' '}
        {entries.length > 1 || !active ? `(${entries.length})` : ''}
        {entries.some((e) => e.id !== activeId && /approval|merge|Failed|Done/.test(e.status))
          ? ' •'
          : ''}
      </button>
      {recent &&
        createPortal(
          <div
            role="status"
            aria-label="Recent Cruxes"
            className="fixed z-[100] top-20 left-1/2 -translate-x-1/2 rounded bg-surface-solid border border-border p-4 shadow-modal"
          >
            {recent.ids.map((id, i) => (
              <div
                key={id}
                aria-current={i === recent.index ? 'true' : undefined}
                className={i === recent.index ? 'text-accent' : 'text-text-muted'}
              >
                {entries.find((e) => e.id === id)?.title ?? 'Closed Crux'}
              </div>
            ))}
            <p className="text-xs text-text-muted mt-2">
              Release Control to switch · Escape to cancel
            </p>
          </div>,
          document.body,
        )}
      {modal &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-start justify-center pt-20 bg-black/40"
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
              className="bg-surface-solid text-text border border-border rounded p-4 w-[min(30rem,calc(100vw-2rem))] shadow-modal"
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
                  <h2>Close {entries.find((e) => e.id === closing)?.title}?</h2>
                  <p className="text-xs my-3">
                    Running work will stop. Queued prompts and Growth remain available when you
                    reopen. Save or discard unsaved Artifact edits before closing.
                  </p>
                  <div className="flex gap-3">
                    <button disabled={busy} onClick={cancel}>
                      Cancel
                    </button>
                    <button disabled={busy} onClick={() => void close('discard')}>
                      Discard edits and close
                    </button>
                    <button disabled={busy} onClick={() => void close('save')}>
                      Save and close
                    </button>
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
                  <label>
                    {copyIdentity(getWorkspace(renaming)?.data.getState().crux)
                      ? 'Task name'
                      : 'Crux title'}
                    <input
                      aria-label={
                        copyIdentity(getWorkspace(renaming)?.data.getState().crux)
                          ? 'Task name'
                          : 'Crux title'
                      }
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="block border p-2 w-full"
                    />
                  </label>
                  <button type="button" onClick={cancel}>
                    Cancel
                  </button>
                  <button disabled={busy} type="submit">
                    Rename
                  </button>
                </form>
              ) : (
                <>
                  <input
                    ref={search}
                    aria-label={picker ? 'Find a Crux in your garden' : 'Find an open Crux'}
                    placeholder={picker ? 'Find a Crux in your garden…' : 'Find an open Crux…'}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setIndex(0);
                    }}
                    className="w-full border border-border rounded p-2 bg-bg mb-3"
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
                        className={`flex items-center gap-2 rounded px-2 ${i === index ? 'bg-accent-muted' : ''}`}
                      >
                        <button
                          className="flex-1 text-left py-2 min-w-0 focus-visible:outline-2 focus-visible:outline-accent"
                          aria-current={row.id === activeId ? 'page' : undefined}
                          onClick={() => choose(row.id)}
                        >
                          <span className="block truncate">
                            {row.id === activeId ? '✓ ' : ''}
                            {row.title}
                          </span>
                          <span className="text-xs text-text-muted">
                            {'status' in row ? row.status : row.slug}
                            {'dirty' in row && row.dirty ? ' · Unsaved edits' : ''}
                            {rows.filter((r) => r.title === row.title).length > 1
                              ? ` · ${row.id.slice(0, 8)}`
                              : ''}
                          </span>
                        </button>
                        {entries.some((e) => e.id === row.id) && (
                          <button
                            aria-label={`Close ${row.title} workspace`}
                            className="p-2"
                            onClick={() => {
                              setClosing(row.id);
                              setError('');
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!rows.length && (
                    <p role="status" className="py-4 text-sm">
                      No matching Cruxes.
                    </p>
                  )}
                  <div className="border-t border-border mt-2 pt-2 flex flex-col items-start gap-2 text-sm">
                    <button
                      onClick={async () => {
                        try {
                          const cruxes = await getServices().crux.listAll();
                          setAvailable(
                            cruxes
                              .filter((c) => c.kind !== 'snapshot')
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
                        <button onClick={() => setClosing(active.id)}>
                          Close current workspace
                        </button>
                      </>
                    )}
                    <button onClick={cancel}>Cancel</button>
                    <span className="text-xs text-text-muted">
                      Ctrl+Tab: recent Cruxes · ↑↓: select · Enter: open
                    </span>
                  </div>
                </>
              )}
              {error && (
                <p role="alert" className="text-error text-xs mt-3">
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
