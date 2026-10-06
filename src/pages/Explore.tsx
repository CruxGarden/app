import { canonicalUrl, usePageMeta } from '@/hooks/usePageMeta';
import { PublicFooter } from '@/components/public/LegalLinks';
import {
  Avatar,
  Panel,
  Button,
  SectionLabel,
  Spinner,
  buttonClass,
  chipClass,
  iconButtonClass,
  fieldClass,
  segmentClass,
  segmentGroupClass,
} from '@/components/ui';
import { SearchIcon, CloseIcon } from '@/components/ui/icons';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { publicApi } from '@/api';
import type {
  ExploreCrux,
  ExploreAuthor,
  ExploreTag,
  ExploreParams,
  ExploreSort,
} from '@/api/public';
import { parseExploreParams, type ExploreView } from './explore-params';
import { useAppStore } from '@/stores/appStore';
import { useUIStore } from '@/stores/uiStore';
import PublishedCreationCard from '@/components/explore/PublishedCreationCard';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import CruxResultCard from '@/components/explore/CruxResultCard';
import { resolveExploreAvatar } from '@/components/explore/author';
import {
  recentExploreTags,
  rememberExploreTag,
  clearExploreTags,
} from '@/components/explore/recent-tags';
import { APP_NAME } from '@/lib/constants';
import DocumentationCard from '@/components/explore/DocumentationCard';
import { emptyCatalogCopy } from '@/services/tool-catalog';
import InstallRequestDialog from '@/components/explore/InstallRequestDialog';
import PageHeader from '@/components/layout/PageHeader';

/**
 * Explore — where a person finds the four things other people share: Cruxes,
 * people, Crux Tools and Moods. Tags are the way in: they sit under the search
 * on arrival, one click filters, and every card carries its own. The website's
 * /explore is this same component with its filters in the URL.
 */
const VIEWS: { id: ExploreView; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cruxes', label: 'Cruxes' },
  { id: 'people', label: 'People' },
  { id: 'tools', label: 'Tools' },
  { id: 'moods', label: 'Moods' },
];
/** The kinds a Crux can be, under the Cruxes tab (Tools and Moods have their own). */
const KINDS: { id: string; label: string }[] = [
  { id: '', label: 'Everything' },
  { id: 'webapp', label: 'Sites' },
  { id: 'page', label: 'Pages' },
  { id: 'notes', label: 'Notes' },
  { id: 'document', label: 'Documents' },
  { id: 'image', label: 'Images' },
];
const KIND_LABEL: Record<string, string> = {
  webapp: 'Site',
  page: 'Page',
  notes: 'Notes',
  document: 'Document',
  image: 'Image',
  mood: 'Mood',
  tool: 'Tool',
};
const SORTS: { id: ExploreSort; label: string }[] = [
  { id: 'relevant', label: 'Best match' },
  { id: 'recent', label: 'Recent' },
  { id: 'newest', label: 'Newest' },
  { id: 'alpha', label: 'A-Z' },
];
const TAGS_SHOWN = 8;

/** One tag as a chip: quiet when available, filled when it is filtering. */
function TagChip({
  label,
  count,
  active,
  onClick,
  size = 'sm',
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  size?: 'xs' | 'sm';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={chipClass(active, size === 'xs' ? 'h-5 px-1.5 text-3xs' : 'h-7 px-2.5 text-xs')}
    >
      #{label}
      {count !== undefined && <span className="ml-1 opacity-50">{count}</span>}
    </button>
  );
}

function AuthorCard({ author }: { author: ExploreAuthor }) {
  const avatarUrl = resolveExploreAvatar(author.meta);
  return (
    <Link
      to={`/${author.username}`}
      className="w-full px-3 py-2.5 text-left rounded-[var(--radius-sm)] hover:bg-action-button-hover transition-colors cursor-pointer group flex items-center gap-3 motion-enter-card"
    >
      <Avatar
        url={avatarUrl}
        initial={(author.display_name || author.username).slice(0, 1).toUpperCase()}
        size="md"
        className="ring-1 ring-text-muted/20"
        fallbackClassName="bg-surface"
      />
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm font-medium text-text group-hover:text-accent truncate">
          {author.display_name || author.username}
        </div>
        <div className="text-xs font-mono text-text-muted truncate">@{author.username}</div>
      </div>
      <div className="text-2xs text-text-muted font-mono shrink-0">
        Joined {formatDate(author.created)}
      </div>
    </Link>
  );
}

/* ── Explore (the pane and the public page) ─────────────── */

/** The filter state Explore exposes — the public page mirrors it into the URL. */
export interface ExploreState {
  q: string;
  type: ExploreView;
  sort: ExploreSort;
  kind: string;
  tags: string[];
  author: string;
  page: number;
}

const isCrux = (r: ExploreCrux | ExploreAuthor): r is ExploreCrux => 'slug' in r;

export default function Explore({
  initial,
  onStateChange,
}: {
  initial?: Partial<ExploreState>;
  onStateChange?: (state: ExploreState) => void;
}) {
  const navigate = useNavigate();

  const [q, setQ] = useState(initial?.q ?? '');
  const [view, setView] = useState<ExploreView>(() => {
    if (initial?.type) return initial.type;
    // The opener asked for a kind (Install from Explore → tools; a Mood link → moods).
    const asked = useUIStore.getState().exploreKind;
    return asked === 'tool' ? 'tools' : asked === 'mood' ? 'moods' : 'all';
  });
  const [sort, setSort] = useState<ExploreSort>(
    initial?.sort ?? (initial?.q ? 'relevant' : 'recent'),
  );
  const [author, setAuthor] = useState(initial?.author ?? '');
  // Inside the app (services ready) results can be installed / opened locally
  const appReady = useAppStore((s) => s.ready);
  const [kind, setKind] = useState<string>(() => {
    const asked = initial?.kind ?? useUIStore.getState().exploreKind ?? '';
    return asked === 'tool' || asked === 'mood' ? '' : asked;
  });
  useEffect(() => {
    if (useUIStore.getState().exploreKind) useUIStore.setState({ exploreKind: null });
  }, []);
  const [activeTags, setActiveTags] = useState<string[]>(initial?.tags ?? []);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [allTags, setAllTags] = useState(false);
  const [recentTags, setRecentTags] = useState(recentExploreTags);

  // Mirror state outward (the public page writes it to the URL so searches are links)
  useEffect(() => {
    onStateChange?.({ q, type: view, sort, kind, tags: activeTags, author, page });
  }, [q, view, sort, kind, activeTags, author, page, onStateChange]);

  const [cruxes, setCruxes] = useState<ExploreCrux[]>([]);
  const [people, setPeople] = useState<ExploreAuthor[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [tags, setTags] = useState<ExploreTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  // An API that could not be reached is not an empty catalogue.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The tags people use, for the view in front (a Mood's tags are not a site's).
  const tagKind = view === 'tools' ? 'tool' : view === 'moods' ? 'mood' : kind || undefined;
  useEffect(() => {
    const controller = new AbortController();
    publicApi
      .exploreTags(60, tagKind, controller.signal)
      .then((tags) => {
        if (!controller.signal.aborted) setTags(tags);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTags([]);
      });
    return () => controller.abort();
  }, [tagKind]);

  // Fetch results: one request per view; All asks for Cruxes and, when there
  // is something to match, people too.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const base: ExploreParams = { sort, page, perPage: view === 'all' ? 12 : 24 };
    if (q) base.q = q;
    if (author) base.author = author;
    if (activeTags.length > 0) base.tag = activeTags;
    const cruxParams: ExploreParams = { ...base, type: 'cruxes' };
    if (view === 'cruxes' && kind) cruxParams.kind = kind;
    if (view === 'tools') cruxParams.kind = 'tool';
    if (view === 'moods') cruxParams.kind = 'mood';
    const wantCruxes = view !== 'people';
    const wantPeople = view === 'people' || (view === 'all' && !!q);
    let unreachable = false;
    const none = { items: [], totalPages: 1 };
    const failedAs = () => {
      unreachable = true;
      return none;
    };
    Promise.all([
      wantCruxes
        ? publicApi.explore(cruxParams, controller.signal).catch(failedAs)
        : Promise.resolve(none),
      wantPeople
        ? publicApi
            .explore(
              { ...base, type: 'authors', perPage: view === 'all' ? 4 : 24 },
              controller.signal,
            )
            .catch(failedAs)
        : Promise.resolve(none),
    ]).then(([c, p]) => {
      if (controller.signal.aborted) return;
      const cruxItems = c.items as (ExploreCrux | ExploreAuthor)[];
      const peopleItems = p.items as (ExploreCrux | ExploreAuthor)[];
      setCruxes(cruxItems.filter(isCrux));
      setPeople(peopleItems.filter((r): r is ExploreAuthor => !isCrux(r)));
      setTotalPages(view === 'people' ? p.totalPages : c.totalPages);
      setFailed(unreachable);
      setLoading(false);
      setLoadedOnce(true);
    });
    return () => {
      controller.abort();
    };
  }, [q, view, sort, activeTags, kind, author, page, attempt]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQ(value);
      // a fresh term ranks by relevance; clearing it falls back to recency
      setSort((prev) =>
        value ? (prev === 'recent' ? 'relevant' : prev) : prev === 'relevant' ? 'recent' : prev,
      );
      setPage(1);
    }, 300);
  }, []);

  const handleClear = useCallback(() => {
    clearTimeout(debounceRef.current);
    if (inputRef.current) inputRef.current.value = '';
    setQ('');
    setSort((prev) => (prev === 'relevant' ? 'recent' : prev));
    setPage(1);
  }, []);

  const toggleTag = useCallback((label: string) => {
    setRecentTags(rememberExploreTag(label));
    setActiveTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label],
    );
    setPage(1);
  }, []);

  const changeView = useCallback((next: ExploreView) => {
    setView(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    clearTimeout(debounceRef.current);
    if (inputRef.current) inputRef.current.value = '';
    setQ('');
    setActiveTags([]);
    setAuthor('');
    setSort('recent');
    setKind('');
    setPage(1);
  }, []);

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  const hasFilters =
    q ||
    activeTags.length > 0 ||
    author ||
    (sort !== 'recent' && sort !== 'relevant') ||
    kind !== '';

  // The All view splits what came back by what it is.
  const byKind = useMemo(
    () => ({
      moods: cruxes.filter((c) => c.kind === 'mood'),
      tools: cruxes.filter((c) => c.kind === 'tool'),
      rest: cruxes.filter((c) => c.kind !== 'mood' && c.kind !== 'tool'),
    }),
    [cruxes],
  );
  const shownTags = allTags ? tags : tags.slice(0, TAGS_SHOWN);
  const empty =
    view === 'people' ? people.length === 0 : cruxes.length === 0 && people.length === 0;

  const specialGrid = (list: ExploreCrux[]) => (
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] p-3">
      {list.map((crux) => (
        <PublishedCreationCard
          key={crux.id}
          crux={crux}
          onNavigate={handleNavigate}
          onTag={toggleTag}
        />
      ))}
    </div>
  );
  const moodGrid = specialGrid;
  const toolGrid = specialGrid;
  const cruxList = (list: ExploreCrux[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-5 p-3 pt-2 sm:p-4 sm:pt-2">
      {list.map((crux) => (
        <CruxResultCard
          key={crux.id}
          crux={crux}
          kindLabel={KIND_LABEL[crux.kind ?? '']}
          activeTags={activeTags}
          onTag={toggleTag}
        />
      ))}
    </div>
  );
  const peopleList = (list: ExploreAuthor[]) => (
    <div className="flex flex-col gap-0.5 px-1.5">
      {list.map((a) => (
        <AuthorCard key={a.id} author={a} />
      ))}
    </div>
  );
  /** A group in the All view: a heading, its results, and a way to see more of that kind. */
  const group = (title: string, to: ExploreView, count: number, body: React.ReactNode) =>
    count > 0 ? (
      <section aria-label={title} className="mb-4">
        <div className="flex items-baseline justify-between px-4 pt-2 pb-1">
          <SectionLabel>{title}</SectionLabel>
          <button
            type="button"
            onClick={() => changeView(to)}
            className={buttonClass(
              'ghost',
              'xs',
              '-mr-2.5 min-h-6 py-0.5 px-2.5 text-xxs text-text-muted',
            )}
          >
            {to === 'cruxes' ? 'All cruxes' : `All ${title.toLowerCase()}`} →
          </button>
        </div>
        {body}
      </section>
    ) : null;

  return (
    <div
      className="overflow-y-auto flex-1 @container"
      style={
        {
          // Explore is the command palette surface (commandPalette* tokens)
          '--panel': 'var(--command-palette)',
          '--panel-border': 'var(--command-palette-border)',
          '--surface': 'var(--command-palette-item)',
          '--accent-muted': 'var(--command-palette-item-hover)',
          '--input': 'var(--command-palette-input)',
          '--input-text': 'var(--command-palette-input-text)',
          '--text': 'var(--command-palette-item-text)',
          '--text-muted': 'var(--command-palette-item-icon)',
        } as React.CSSProperties
      }
    >
      <div className="mb-3 @xl:flex @xl:items-center @xl:justify-between @xl:gap-4">
        <header className="rounded-[var(--radius)] border border-panel-border bg-panel px-3 py-2 mb-2 @xl:mb-0 @xl:flex-1">
          <h2 className="text-2xl font-display font-medium text-text">Explore Home</h2>
          <p className="mt-1 text-sm text-text-muted">
            Discover published Cruxes, creators, tools and Moods. Your own work stays in your
            Garden.
          </p>
        </header>
        {view === 'all' && !q && !author && activeTags.length === 0 && (
          <DocumentationCard local={appReady} />
        )}
      </div>
      {recentTags.length > 0 && (
        <section
          aria-label="Your recent tags"
          className="rounded-[var(--radius)] border border-border bg-panel p-3 mb-3"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-text">Pick up a thread</h3>
            <button
              type="button"
              onClick={() => {
                clearExploreTags();
                setRecentTags([]);
              }}
              className={buttonClass('ghost', 'xs')}
              aria-label="Clear recent tags"
            >
              Clear history
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentTags.map((tag) => (
              <TagChip
                key={tag}
                label={tag}
                active={activeTags.includes(tag)}
                onClick={() => toggleTag(tag)}
              />
            ))}
          </div>
        </section>
      )}
      <Panel padding="sm" className="mb-2">
        {/* One search for everything */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <SearchIcon size={16} />
          </div>
          <input
            ref={inputRef}
            type="text"
            defaultValue={initial?.q ?? ''}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              // Enter asks again even when the words are the same (a listing may have changed).
              if (e.key === 'Enter') {
                clearTimeout(debounceRef.current);
                setQ(e.currentTarget.value);
                setAttempt((n) => n + 1);
              }
            }}
            placeholder="Search cruxes, people, tools, moods and authors… (@name, #tag)"
            aria-label="Search Explore"
            className={fieldClass(undefined, 'pl-10 pr-9')}
          />
          {q && (
            <button
              onClick={handleClear}
              aria-label="Clear search"
              className={iconButtonClass('xs', false, 'absolute right-2 top-1/2 -translate-y-1/2')}
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>

        {/* What to look through */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <div role="tablist" aria-label="Look through" className={segmentGroupClass()}>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => changeView(v.id)}
                className={segmentClass(view === v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className={segmentGroupClass()} role="group" aria-label="Sort">
            <span className="sr-only">Sort</span>
            {SORTS.filter((s) => s.id !== 'relevant' || q).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSort(s.id);
                  setPage(1);
                }}
                aria-pressed={sort === s.id}
                className={segmentClass(sort === s.id, 'xs', 'font-mono')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* What is filtering right now */}
        {(author || activeTags.length > 0 || kind) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3" data-testid="active-filters">
            {author && (
              <button
                type="button"
                onClick={() => {
                  setAuthor('');
                  setPage(1);
                }}
                className={chipClass(true)}
                aria-label={`Remove author filter ${author}`}
              >
                @{author} ×
              </button>
            )}
            {activeTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={chipClass(true)}
                aria-label={`Remove tag filter ${t}`}
              >
                #{t} ×
              </button>
            ))}
            {kind && view === 'cruxes' && (
              <button
                type="button"
                onClick={() => {
                  setKind('');
                  setPage(1);
                }}
                className={chipClass(true)}
                aria-label={`Remove kind filter ${KIND_LABEL[kind] ?? kind}`}
              >
                {KINDS.find((k) => k.id === kind)?.label ?? kind} ×
              </button>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className={buttonClass('ghost', 'xs', 'min-h-6 py-0.5 px-2 text-xxs text-text-muted')}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Tags: the way in */}
        {view !== 'people' && tags.length > 0 && (
          <div className="mt-3" data-testid="explore-tags">
            <div className="flex items-baseline justify-between mb-1.5">
              <SectionLabel>Popular tags</SectionLabel>
              {tags.length > TAGS_SHOWN && (
                <button
                  type="button"
                  onClick={() => setAllTags((v) => !v)}
                  className={buttonClass(
                    'ghost',
                    'xs',
                    '-mr-2 min-h-6 py-0.5 px-2 text-xxs text-text-muted',
                  )}
                >
                  {allTags ? 'Fewer tags' : `All ${tags.length} tags`}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {shownTags.map((tag) => (
                <TagChip
                  key={tag.label}
                  label={tag.label}
                  count={tag.count}
                  active={activeTags.includes(tag.label)}
                  onClick={() => toggleTag(tag.label)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Under Cruxes: what kind */}
        {view === 'cruxes' && (
          <div className="flex flex-wrap gap-1.5 mt-3" role="group" aria-label="Kind">
            {KINDS.map((k) => (
              <button
                key={k.id || 'all'}
                type="button"
                onClick={() => {
                  setKind(k.id);
                  setPage(1);
                }}
                aria-pressed={kind === k.id}
                className={chipClass(kind === k.id, 'font-body')}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* Results */}
      {!loadedOnce && loading ? (
        <Panel padding="md" className="flex items-center justify-center gap-2 py-16">
          <Spinner size={14} />
          <p className="text-text-muted text-sm">Looking…</p>
        </Panel>
      ) : failed && empty ? (
        <Panel padding="md" className="flex flex-col items-center py-10 text-center" role="alert">
          <p className="text-text text-sm mb-1">Couldn't reach crux.garden</p>
          <p className="text-xs text-text-muted mb-3">Check your connection and try again.</p>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </Panel>
      ) : empty && !hasFilters && (view === 'tools' || view === 'moods') ? (
        // CR07: an honest empty catalog, not an invitation to look again.
        <Panel
          padding="md"
          className="flex flex-col items-center py-10 text-center"
          data-testid={`explore-empty-${view}`}
        >
          <p className="text-text text-sm mb-1">{emptyCatalogCopy(view).title}</p>
          <p className="text-xs text-text-muted mb-3">{emptyCatalogCopy(view).body}</p>
          {appReady && view === 'tools' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void import('@/components/layout/app-commands').then((commands) =>
                  commands.newCrux(navigate),
                )
              }
            >
              Make a tool
            </Button>
          )}
        </Panel>
      ) : empty ? (
        <Panel padding="md" className="flex flex-col items-center py-10 text-center">
          <p className="text-text text-sm mb-1">
            {hasFilters ? 'No results match your search' : 'Nothing here yet'}
          </p>
          {tags.length > 0 && (
            <>
              <p className="text-xs text-text-muted mb-3">Try a tag:</p>
              <div className="flex flex-wrap justify-center gap-1.5 mb-3">
                {tags.slice(0, 8).map((tag) => (
                  <TagChip
                    key={tag.label}
                    label={tag.label}
                    count={tag.count}
                    active={activeTags.includes(tag.label)}
                    onClick={() => {
                      if (!activeTags.includes(tag.label)) setActiveTags([tag.label]);
                      clearTimeout(debounceRef.current);
                      setRecentTags(rememberExploreTag(tag.label));
                      setQ('');
                      if (inputRef.current) inputRef.current.value = '';
                      setPage(1);
                    }}
                  />
                ))}
              </div>
            </>
          )}
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </Panel>
      ) : (
        <Panel
          padding="none"
          className={cn('py-1.5 transition-opacity', loading && 'opacity-60')}
          aria-busy={loading}
        >
          {view === 'all' && (
            <>
              {group('People', 'people', people.length, peopleList(people))}
              {group(
                hasFilters ? 'Cruxes' : 'Fresh creations',
                'cruxes',
                byKind.rest.length,
                cruxList(byKind.rest),
              )}
              {group('Tools', 'tools', byKind.tools.length, toolGrid(byKind.tools))}
              {group('Moods', 'moods', byKind.moods.length, moodGrid(byKind.moods))}
            </>
          )}
          {view === 'cruxes' && cruxList(cruxes)}
          {view === 'people' && peopleList(people)}
          {view === 'tools' && toolGrid(cruxes)}
          {view === 'moods' && moodGrid(cruxes)}

          {/* Pagination */}
          {view !== 'all' && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 mb-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={buttonClass('ghost', 'xs', 'text-text-muted')}
              >
                Prev
              </button>
              <span className="text-xs font-mono text-text-muted">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={buttonClass('ghost', 'xs', 'text-text-muted')}
              >
                Next
              </button>
            </div>
          )}
        </Panel>
      )}
      {appReady && <InstallRequestDialog />}
    </div>
  );
}

/* ── Public route page (with URL param syncing) ────────── */

export function ExplorePage() {
  usePageMeta({
    title: `Explore Home — ${APP_NAME}`,
    description:
      'Browse what people have made and published with Crux Garden: creations, creators, tools and Moods.',
    canonical: canonicalUrl('/explore'),
  });

  // Filters live in the URL so every search is a link (the website embeds this
  // page). Values are validated here — anything can arrive in a query string.
  const [params, setParams] = useSearchParams();
  const paramsKey = params.toString();
  const initial: Partial<ExploreState> = parseExploreParams(params);

  // Explore owns its filter state after mount and mirrors it out to the URL.
  // When the URL changes for another reason — a link into this page while it
  // is already mounted, back/forward — remount Explore so it picks the new
  // filters up. Changes we wrote ourselves are recognised and leave it alone.
  const lastWritten = useRef(paramsKey);
  const [routeState, setRouteState] = useState({ key: paramsKey, epoch: 0 });
  if (routeState.key !== paramsKey) {
    // Reset external navigation before committing the old search's effects.
    // Doing this in an effect let the old search write its URL back while Home
    // was resetting it, repeatedly remounting the results and aborting requests.
    const ownUpdate = lastWritten.current === paramsKey;
    lastWritten.current = paramsKey;
    setRouteState({ key: paramsKey, epoch: routeState.epoch + (ownUpdate ? 0 : 1) });
  }

  const onStateChange = useCallback(
    (s: ExploreState) => {
      const next = new URLSearchParams();
      if (s.q) next.set('q', s.q);
      if (s.type !== 'all') next.set('type', s.type);
      if (s.sort !== (s.q ? 'relevant' : 'recent')) next.set('sort', s.sort);
      if (s.kind) next.set('kind', s.kind);
      for (const t of s.tags) next.append('tag', t);
      if (s.author) next.set('author', s.author);
      if (s.page > 1) next.set('page', String(s.page));
      const nextKey = next.toString();
      if (nextKey !== paramsKey) {
        lastWritten.current = nextKey;
        setParams(next, { replace: true });
      }
    },
    [paramsKey, setParams],
  );

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader title="Explore Home" area="explore" />

      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <Explore key={routeState.epoch} initial={initial} onStateChange={onStateChange} />
        <PublicFooter className="mt-6" />
      </div>
    </div>
  );
}
