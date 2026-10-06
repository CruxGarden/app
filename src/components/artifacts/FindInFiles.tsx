import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Artifact } from '@/api/types';
import { fieldClass } from '@/components/ui/field-class';
import { iconButtonClass, rowClass } from '@/components/ui/button-class';
import SectionLabel from '@/components/ui/SectionLabel';
import {
  FIND_RESULT_LIMIT,
  findInFiles,
  type FindFileResult,
  type FindMatch,
  type FindResults,
} from '@/services/find-in-files';

const DEBOUNCE_MS = 200;

/** One result line: its number, and the text with the match marked. */
function MatchPreview({ match }: { match: FindMatch }) {
  const { preview, previewStart, length } = match;
  return (
    <span className="min-w-0 truncate">
      {preview.slice(0, previewStart)}
      <mark className="rounded-[var(--radius-sm)] bg-accent-muted text-accent">
        {preview.slice(previewStart, previewStart + length)}
      </mark>
      {preview.slice(previewStart + length)}
    </span>
  );
}

/** Matches grouped by file. Presentation only: the search lives in the service. */
export function FindResultsList({
  results,
  query,
  onOpen,
}: {
  results: FindResults;
  query: string;
  onOpen: (file: FindFileResult, match: FindMatch) => void;
}) {
  if (!results.files.length)
    return (
      <p role="status" className="p-3 text-xs text-text-muted">
        No matches for “{query}”.
        {results.skipped > 0 && ` ${skippedNote(results.skipped)}`}
      </p>
    );
  return (
    <div className="flex flex-col gap-2 p-2" data-testid="find-results">
      <p role="status" className="px-1 text-2xs font-mono text-text-muted">
        {results.truncated
          ? `Showing the first ${results.total} matches. Narrow the search to see the rest.`
          : `${results.total} ${results.total === 1 ? 'match' : 'matches'} in ${results.files.length} ${results.files.length === 1 ? 'file' : 'files'}`}
        {results.skipped > 0 && ` ${skippedNote(results.skipped)}`}
      </p>
      {results.files.map((file) => (
        <section key={file.id} aria-label={file.path} data-find-file={file.path}>
          <SectionLabel as="h3" tone="muted" className="truncate px-1 py-0.5 normal-case">
            {file.path} · {file.matches.length}
          </SectionLabel>
          <ul>
            {file.matches.map((match) => (
              <li key={`${match.line}:${match.column}`}>
                <button
                  type="button"
                  onClick={() => onOpen(file, match)}
                  title={`${file.path}:${match.line}`}
                  className={rowClass(false, 'gap-2 px-1 py-1 text-xs font-mono')}
                >
                  <span className="w-8 shrink-0 text-right text-text-muted">{match.line}</span>
                  <MatchPreview match={match} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function skippedNote(count: number): string {
  return count === 1
    ? '1 file was too large to search.'
    : `${count} files were too large to search.`;
}

/**
 * Find in files: one quiet input over the file tree. While there is a query the
 * results take the tree's place; clear it and the tree is back. Typing is
 * debounced and a search that has been typed past is abandoned.
 */
export default function FindInFiles({
  artifacts,
  onOpen,
  children,
}: {
  /** The files on show in the pane (hidden files are not searched). */
  artifacts: readonly Artifact[];
  onOpen: (file: FindFileResult, match: FindMatch) => void;
  /** The file tree, shown while there is no query. */
  children: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [state, setState] = useState<{ query: string; results: FindResults } | null>(null);
  const [error, setError] = useState('');
  // Search what is on show now without restarting on every unrelated file event.
  const files = useRef(artifacts);
  files.current = artifacts;
  const contentKey = artifacts.map((a) => `${a.id}:${a.fingerprint ?? ''}`).join('|');

  useEffect(() => {
    setError('');
    if (!query) {
      setState(null);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      findInFiles({
        artifacts: files.current,
        query,
        caseSensitive: matchCase,
        signal: abort.signal,
      })
        .then((results) => {
          if (!abort.signal.aborted) setState({ query, results });
        })
        .catch((err: Error) => {
          if (!abort.signal.aborted) setError(err.message || 'Search failed.');
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, matchCase, contentKey]);

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              setQuery('');
            }
          }}
          placeholder="Find in files"
          aria-label="Find in files"
          maxLength={2048}
          spellCheck={false}
          className={fieldClass(undefined, 'h-7 min-w-0 flex-1', 'sm')}
        />
        <button
          type="button"
          aria-pressed={matchCase}
          aria-label="Match case"
          title="Match case"
          onClick={() => setMatchCase((on) => !on)}
          className={iconButtonClass('xs', matchCase, 'text-2xs font-mono')}
        >
          Aa
        </button>
      </div>
      {!query ? (
        children
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={state?.query !== query}>
          {error ? (
            <p role="alert" className="p-3 text-xs text-error">
              {error}
            </p>
          ) : state ? (
            <FindResultsList results={state.results} query={state.query} onOpen={onOpen} />
          ) : (
            <p role="status" className="p-3 text-xs text-text-muted">
              Searching…
            </p>
          )}
        </div>
      )}
    </>
  );
}

export { FIND_RESULT_LIMIT };
