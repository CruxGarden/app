import { useEffect, useRef, useState } from 'react';
import { useWorkspaceUIStore } from '@/stores/uiStore';
import { can, Capability } from '@/lib/platform';
import {
  browserControls,
  controlBrowser,
  restoreBrowser,
  useBrowserPanels,
} from '@/services/browser-panel';
import { openWeb } from '@/services/desktop';

export default function BrowserPane() {
  const id = useWorkspaceUIStore((s) => s.activeCruxId);
  const state = useBrowserPanels((s) => (id ? s.states[id] : undefined));
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const supported = can(Capability.WebBrowser);
  useEffect(() => {
    if (!supported || !id) return;
    const focus = () => {
      addressInput.current?.focus();
      addressInput.current?.select();
    };
    const off = browserControls().onFocusAddress((owner) => {
      if (owner === id) focus();
    });
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      off();
      window.removeEventListener('keydown', key);
    };
  }, [id, supported]);
  useEffect(() => {
    if (state?.url) setAddress(state.url);
  }, [state?.url]);
  useEffect(() => {
    if (!supported || !id) return;
    const abort = new AbortController();
    void restoreBrowser(id, abort.signal).catch((e) => {
      if (!abort.signal.aborted) setError(String(e));
    });
    return () => {
      abort.abort();
      void browserControls()
        .action(id, 'close')
        .catch(() => {});
    };
  }, [id, supported]);
  useEffect(() => {
    if (!supported || !id || !host.current) return;
    const element = host.current,
      api = browserControls();
    let frame = 0,
      last = '';
    const update = () => {
      const r = element.getBoundingClientRect();
      let visible =
        !!(state?.url || state?.loading) && r.width > 1 && r.height > 1 && !document.hidden;
      // Native views sit above DOM pixels. Hide while a modal or overlapping menu owns this space.
      if (document.querySelector('[aria-modal="true"]')) visible = false;
      const inside = (x: number, y: number) => element.contains(document.elementFromPoint(x, y));
      if (visible) {
        for (const [x, y] of [
          [r.left + 2, r.top + 2],
          [r.right - 2, r.top + 2],
          [r.left + 2, r.bottom - 2],
          [r.right - 2, r.bottom - 2],
          [r.left + r.width / 2, r.top + r.height / 2],
        ])
          if (!inside(x!, y!)) visible = false;
      }
      if (visible)
        for (const overlay of document.querySelectorAll<HTMLElement>(
          '[role="menu"],[role="listbox"],[data-motion-role="dropdown"],[data-motion-role="tooltip"],.fixed',
        )) {
          if (overlay.contains(element) || element.contains(overlay)) continue;
          const o = overlay.getBoundingClientRect();
          const left = Math.max(r.left, o.left),
            right = Math.min(r.right, o.right);
          const top = Math.max(r.top, o.top),
            bottom = Math.min(r.bottom, o.bottom);
          if (right > left && bottom > top && !inside((left + right) / 2, (top + bottom) / 2)) {
            visible = false;
            break;
          }
        }
      const bounds = visible ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      const serialized = JSON.stringify(bounds);
      if (serialized !== last) {
        last = serialized;
        void api.bounds(id, bounds).catch((e) => setError(String(e)));
      }
      frame = 0;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('visibilitychange', schedule);
      void api.bounds(id, null).catch(() => {});
    };
  }, [id, supported, state?.url, state?.loading]);
  const act = (action: 'navigate' | 'back' | 'forward' | 'reload' | 'stop') => {
    if (!id) return;
    setError('');
    void controlBrowser(id, action, address).catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  };
  if (!supported)
    return <p className="p-4 text-sm text-text-muted">WWW is available in the desktop app.</p>;
  return (
    <div className="h-full min-h-0 flex flex-col p-2 gap-2" aria-label="WWW browser">
      <form
        className="flex flex-wrap items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          act('navigate');
        }}
      >
        <button
          type="button"
          aria-label="Browser back"
          disabled={!state?.back}
          onClick={() => act('back')}
          className="px-2 py-1 disabled:opacity-40"
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Browser forward"
          disabled={!state?.forward}
          onClick={() => act('forward')}
          className="px-2 py-1 disabled:opacity-40"
        >
          →
        </button>
        <button
          type="button"
          aria-label={state?.loading ? 'Stop browser loading' : 'Reload browser'}
          onClick={() => act(state?.loading ? 'stop' : 'reload')}
          className="px-2 py-1"
        >
          {state?.loading ? '×' : '↻'}
        </button>
        <input
          ref={addressInput}
          aria-label="Browser address"
          placeholder="Enter a web address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="min-w-24 flex-1 bg-surface border border-border rounded px-2 py-1 text-xs"
        />
        <button type="submit" className="px-2 py-1 text-xs">
          Go
        </button>
        <button
          type="button"
          disabled={!state?.url}
          aria-label="Open page in system browser"
          onClick={() => {
            if (state?.url) void openWeb(state.url);
          }}
          className="px-2 py-1 text-xs disabled:opacity-40"
        >
          ↗
        </button>
      </form>
      {(error || state?.error) && (
        <p role="alert" className="text-xs text-error">
          {error || state?.error}
        </p>
      )}
      <div
        ref={host}
        data-testid="browser-page"
        className="flex-1 min-h-0 bg-panel rounded overflow-hidden"
      >
        {!state?.url && !state?.loading && (
          <p className="p-4 text-sm text-text-muted">Keep a website beside your work.</p>
        )}
      </div>
    </div>
  );
}
