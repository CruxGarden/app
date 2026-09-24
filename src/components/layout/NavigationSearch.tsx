import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGardenContext } from '@/stores/gardenContext';
import {
  searchNavigation,
  type NavigationSearchItem,
  type NavigationSearchCursor,
} from '@/services/navigation-search';
import type { NavigationViewProps } from './navigation-view';

/** A search view of Navigator, using the same route output as Tree and Neighborhood. */
export default function NavigationSearch({
  navigate,
  gardenId,
  graph,
  children,
}: NavigationViewProps & { children: ReactNode }) {
  const request = useGardenContext((s) => s.searchRequest);
  const input = useRef<HTMLInputElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (request) {
      input.current?.focus();
      input.current?.select();
    }
  }, [request]);
  const finish = (restore: boolean) => {
    const state = useGardenContext.getState();
    const session = state.searchRequest;
    setQuery('');
    state.finishSearch();
    if (session?.closeOnExit) state.setNavigatorOpen(false);
    if (restore) {
      if (session?.returnFocus?.isConnected) session.returnFocus.focus();
      else input.current?.focus();
    }
  };
  const open = (item: NavigationSearchItem) => {
    navigate(item.kind === 'garden' ? item.id : gardenId, item.kind === 'garden' ? null : item.id);
    finish(false);
  };
  const term = query.trim();
  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && (query || request)) {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
        }
      }}
    >
      <div className="px-3 pb-3">
        <input
          ref={input}
          type="search"
          aria-label="Find Gardens and Cruxes"
          title="Find Gardens and Cruxes · Cmd/Ctrl+K"
          placeholder="Find a Garden or Crux…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const buttons = region.current?.querySelectorAll<HTMLButtonElement>(
              'button[data-search-result]',
            );
            const button = e.key === 'ArrowDown' ? buttons?.[0] : buttons?.[buttons.length - 1];
            if (button) {
              e.preventDefault();
              button.focus();
            }
          }}
          className="w-full min-w-0 rounded border border-border bg-surface px-2 py-2 text-xs focus:outline-accent"
        />
      </div>
      {term ? (
        <div
          ref={region}
          role="region"
          aria-label="Search results"
          className="overflow-y-auto flex-1 min-h-0 px-2 pb-4"
        >
          <Results
            key={`${term}:${graph.revision}`}
            term={term}
            open={open}
            focusInput={() => input.current?.focus()}
          />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
function Results({
  term,
  open,
  focusInput,
}: {
  term: string;
  open: (item: NavigationSearchItem) => void;
  focusInput: () => void;
}) {
  const [items, setItems] = useState<NavigationSearchItem[]>([]);
  const [next, setNext] = useState<NavigationSearchCursor | null>(null);
  const [cursor, setCursor] = useState<NavigationSearchCursor>();
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        void searchNavigation(term, cursor)
          .then((page) => {
            if (!active) return;
            setItems((previous) => (cursor ? [...previous, ...page.items] : page.items));
            setNext(page.next);
            setBusy(false);
          })
          .catch((cause: unknown) => {
            if (active) {
              setError(cause instanceof Error ? cause.message : 'Search is unavailable.');
              setBusy(false);
            }
          });
      },
      cursor ? 0 : 150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, cursor, retry]);
  return (
    <div
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-search-result]'),
        ];
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const target = buttons[index + (event.key === 'ArrowDown' ? 1 : -1)];
        if (target) target.focus();
        else focusInput();
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          data-search-result
          onClick={() => open(item)}
          className="block w-full text-left rounded px-2 py-2 hover:bg-surface focus-visible:outline-accent cursor-pointer"
        >
          <span className="block text-sm break-words">{item.title || 'Untitled'}</span>
          <span className="block text-xxs text-text-muted break-words">{item.location}</span>
        </button>
      ))}
      {busy && (
        <p role="status" className="p-2 text-xs text-text-muted">
          Searching…
        </p>
      )}
      {error && (
        <div className="p-2 text-xs">
          <p role="alert">{error}</p>
          <button
            onClick={() => {
              setError('');
              setBusy(true);
              setRetry((n) => n + 1);
            }}
            className="mt-2 underline cursor-pointer"
          >
            Retry search
          </button>
        </div>
      )}
      {!busy && !error && !items.length && (
        <p role="status" className="p-2 text-xs text-text-muted">
          No Gardens or Cruxes found.
        </p>
      )}
      {!busy && !error && next && (
        <button
          onClick={() => {
            setBusy(true);
            setCursor(next);
          }}
          className="p-2 text-xs underline cursor-pointer"
        >
          More results
        </button>
      )}
    </div>
  );
}
